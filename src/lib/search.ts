import "server-only";
import { and, arrayContains, asc, eq, gte, inArray, lte, notExists, sql, lt, gt } from "drizzle-orm";
import { db } from "./db";
import { areas, bookings, calendarDays, listings, photos, ratePlans } from "@/db/schema";
import { HOLDING } from "./bookings";
import { BENCHMARK_ADR, fairness, median, quoteStay, suggestedNightly, type Fairness } from "./pricing";
import { GUEST_FEE_BPS, HOST_FEE_BPS } from "./fees";
import { nightsBetween } from "./dates";

export type SearchFilters = {
  areaId?: string; gov?: string; type?: string; amenity?: string; guests?: number; budget?: number;
  checkIn?: Date; checkOut?: Date; sort?: "rec" | "value" | "low" | "high";
};

export type Card = {
  id: string; titleEn: string; titleAr: string; areaId: string; areaEn: string; areaAr: string; gov: string; type: string;
  bedrooms: number; maxGuests: number; nightly: number; monthly: number | null; ratingAvg: number | null; ratingCount: number;
  lat: number | null; lng: number | null; photo: string | null; sample: boolean; lastVerifiedAt: Date | null;
  fair: Fairness & { scope: "area" | "governorate" | "benchmark" }; total: number | null; nights: number;
};

/** Live listings with their nightly price, used for peer medians. */
async function liveIndex() {
  return db.select({ id: listings.id, areaId: listings.areaId, bedrooms: listings.bedrooms, gov: areas.governorate, nightly: ratePlans.nightly })
    .from(listings).innerJoin(ratePlans, eq(ratePlans.listingId, listings.id)).innerJoin(areas, eq(areas.id, listings.areaId))
    .where(eq(listings.status, "live"));
}

export function fairFrom(index: Awaited<ReturnType<typeof liveIndex>>, l: { id: string; areaId: string; bedrooms: number; gov: string; nightly: number }) {
  const near = (x: { bedrooms: number }) => Math.abs(x.bedrooms - l.bedrooms) <= 1;
  const inArea = index.filter((x) => x.id !== l.id && x.areaId === l.areaId && near(x)).map((x) => x.nightly);
  const inGov = index.filter((x) => x.id !== l.id && x.gov === l.gov && near(x)).map((x) => x.nightly);
  const scope = inArea.length ? "area" : inGov.length >= 2 ? "governorate" : "benchmark";
  const peers = scope === "area" ? inArea : scope === "governorate" ? inGov : [];
  return { ...fairness(l.nightly, peers, suggestedNightly(l.gov, l.bedrooms, [])), scope } as Card["fair"];
}

export async function searchListings(f: SearchFilters): Promise<Card[]> {
  const nights = f.checkIn && f.checkOut ? nightsBetween(f.checkIn, f.checkOut) : 0;
  const conds = [
    eq(listings.status, "live"),
    f.areaId ? eq(listings.areaId, f.areaId) : undefined,
    f.gov ? eq(areas.governorate, f.gov) : undefined,
    f.type ? eq(listings.type, f.type) : undefined,
    f.amenity ? arrayContains(listings.amenities, [f.amenity]) : undefined,
    f.guests ? gte(listings.maxGuests, f.guests) : undefined,
    f.budget ? lte(ratePlans.nightly, f.budget) : undefined,
  ];
  if (nights > 0) {
    conds.push(lte(ratePlans.minNights, nights), gte(ratePlans.maxNights, nights));
    conds.push(notExists(db.select({ x: sql`1` }).from(bookings).where(and(
      eq(bookings.listingId, listings.id), inArray(bookings.status, HOLDING), lt(bookings.checkIn, f.checkOut!), gt(bookings.checkOut, f.checkIn!)))));
    conds.push(notExists(db.select({ x: sql`1` }).from(calendarDays).where(and(
      eq(calendarDays.listingId, listings.id), eq(calendarDays.available, false), gte(calendarDays.date, f.checkIn!), lt(calendarDays.date, f.checkOut!)))));
  }
  const rows = await db.select({ l: listings, r: ratePlans, a: areas }).from(listings)
    .innerJoin(ratePlans, eq(ratePlans.listingId, listings.id)).innerJoin(areas, eq(areas.id, listings.areaId))
    .where(and(...conds)).limit(300);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.l.id);
  const firstPhotos = await db.selectDistinctOn([photos.listingId], { listingId: photos.listingId, fileKey: photos.fileKey })
    .from(photos).where(and(inArray(photos.listingId, ids), eq(photos.pending, false))).orderBy(photos.listingId, asc(photos.sortOrder));
  const photoBy = new Map(firstPhotos.map((p) => [p.listingId, p.fileKey]));
  const index = await liveIndex();
  const cards: Card[] = rows.map(({ l, r, a }) => ({
    id: l.id, titleEn: l.titleEn, titleAr: l.titleAr, areaId: a.id, areaEn: a.nameEn, areaAr: a.nameAr, gov: a.governorate, type: l.type,
    bedrooms: l.bedrooms, maxGuests: l.maxGuests, nightly: r.nightly, monthly: r.monthly, ratingAvg: l.ratingAvg, ratingCount: l.ratingCount,
    lat: l.lat ?? a.lat, lng: l.lng ?? a.lng, photo: photoBy.get(l.id) ?? null, sample: l.sample, lastVerifiedAt: l.lastVerifiedAt,
    fair: fairFrom(index, { id: l.id, areaId: a.id, bedrooms: l.bedrooms, gov: a.governorate, nightly: r.nightly }),
    total: nights > 0 ? quoteStay(r, f.checkIn!, f.checkOut!, { guestBps: GUEST_FEE_BPS, hostBps: HOST_FEE_BPS }).total : null,
    nights,
  }));
  const sort = f.sort ?? "rec";
  const score = (c: Card) => (c.ratingAvg ?? 4.5) * Math.log10(10 + c.ratingCount) - (c.fair.diffPct > 0 ? c.fair.diffPct / 100 : 0);
  cards.sort(
    sort === "low" ? (a, b) => a.nightly - b.nightly
      : sort === "high" ? (a, b) => b.nightly - a.nightly
      : sort === "value" ? (a, b) => a.fair.diffPct - b.fair.diffPct
      : (a, b) => score(b) - score(a),
  );
  return cards;
}

/** Typical nightly price per area (median of live homes), for the budget helper and area tiles. */
export async function areaMedians() {
  const index = await liveIndex();
  const out: Record<string, { median: number; count: number }> = {};
  for (const id of new Set(index.map((x) => x.areaId))) {
    const p = index.filter((x) => x.areaId === id).map((x) => x.nightly);
    out[id] = { median: median(p), count: p.length };
  }
  return out;
}
export { BENCHMARK_ADR };
