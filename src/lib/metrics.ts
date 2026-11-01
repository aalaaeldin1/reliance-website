import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { areas, bookings, listings, payments, searchEvents } from "@/db/schema";
import { addDays, dayStr, nightsBetween, todayUtc } from "./dates";
import { median } from "./pricing";

const PAID = ["confirmed", "in_stay", "completed"] as const;

/** Everything the admin overview and demand dashboards draw, computed from the live tables. */
export async function overviewMetrics(opts: { areaId?: string; days?: number } = {}) {
  const today = todayUtc();
  const since = addDays(today, -(opts.days ?? 84));
  const areaCond = opts.areaId ? eq(listings.areaId, opts.areaId) : undefined;
  const [allListings, paid, payRows] = await Promise.all([
    db.select({ id: listings.id, status: listings.status, areaId: listings.areaId, hasPendingEdits: listings.hasPendingEdits }).from(listings).where(areaCond),
    db.select({ b: bookings, areaId: listings.areaId }).from(bookings).innerJoin(listings, eq(listings.id, bookings.listingId))
      .where(and(inArray(bookings.status, [...PAID]), areaCond)),
    db.select({ method: payments.method, n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "confirmed")).groupBy(payments.method),
  ]);
  const live = allListings.filter((x) => x.status === "live");
  const inWindow = paid.filter((r) => r.b.createdAt >= since);
  const gbv = inWindow.reduce((s, r) => s + r.b.total, 0);
  const revenue = inWindow.reduce((s, r) => s + r.b.guestFee + r.b.hostFee, 0);
  const nights = inWindow.reduce((s, r) => s + r.b.nights, 0);
  const adr = nights ? Math.round(inWindow.reduce((s, r) => s + r.b.baseAmount, 0) / nights) : 0;
  // Occupancy, last 30 days: booked nights ÷ (live homes × 30).
  const o0 = addDays(today, -30);
  let occN = 0;
  for (const r of paid) {
    const a = r.b.checkIn > o0 ? r.b.checkIn : o0, e = r.b.checkOut < today ? r.b.checkOut : today;
    occN += Math.max(0, nightsBetween(a, e));
  }
  const occupancy = live.length ? (occN / (live.length * 30)) * 100 : 0;
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(today, -7 * (11 - i)), start = addDays(end, -7);
    const rows = paid.filter((r) => r.b.createdAt >= start && r.b.createdAt < addDays(end, 1));
    return { label: dayStr(end).slice(5), v: rows.reduce((s, r) => s + r.b.total, 0) };
  });
  const byArea = new Map<string, number>();
  for (const r of inWindow) byArea.set(r.areaId, (byArea.get(r.areaId) ?? 0) + r.b.total);
  const pipeline = (["live", "pending", "changes_requested", "paused", "suspended", "rejected", "draft"] as const).map((s) => ({ status: s, n: allListings.filter((x) => x.status === s).length }));
  return { live: live.length, pending: allListings.filter((x) => x.status === "pending" || x.hasPendingEdits).length, gbv, revenue, adr, occupancy, stays: inWindow.length, weeks, byArea, pipeline, payRows };
}

export async function demandMetrics(days = 60) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [searches, live, areaRows, guestsBooked] = await Promise.all([
    db.select().from(searchEvents).where(gte(searchEvents.createdAt, since)),
    db.select({ areaId: listings.areaId, nightly: sql<number>`(select nightly from rate_plans where listing_id = ${listings.id})` }).from(listings).where(eq(listings.status, "live")),
    db.select().from(areas),
    db.selectDistinct({ g: bookings.guestId }).from(bookings).where(gte(bookings.createdAt, since)),
  ]);
  const searchers = new Set(searches.map((s) => s.userId).filter(Boolean));
  const bookers = guestsBooked.filter((g) => searchers.has(g.g)).length;
  const byArea = areaRows.map((a) => {
    const s = searches.filter((x) => x.areaId === a.id), supply = live.filter((x) => x.areaId === a.id);
    return { area: a, searches: s.length, supply: supply.length, budget: median(s.filter((x) => x.budget > 0).map((x) => x.budget)), price: median(supply.map((x) => Number(x.nightly))) };
  });
  const bands: [number, number][] = [[0, 150_000], [150_000, 250_000], [250_000, 350_000], [350_000, 500_000], [500_000, Infinity]];
  const withBudget = searches.filter((s) => s.budget > 0);
  return {
    total: searches.length, noArea: searches.filter((s) => !s.areaId).length, zeroResults: searches.filter((s) => s.resultsCount === 0).length,
    searchers: searchers.size, bookers, medianBudget: median(withBudget.map((s) => s.budget)), medianPrice: median(live.map((x) => Number(x.nightly))),
    byArea, bands: bands.map(([a, b]) => ({ a, b, budgets: withBudget.filter((s) => s.budget > a && s.budget <= b).length, homes: live.filter((x) => Number(x.nightly) > a && Number(x.nightly) <= b).length })),
    party: [1, 2, 3, 4, 5, 6].map((n) => ({ n, v: searches.filter((s) => (n === 6 ? s.guests >= 6 : s.guests === n)).length })),
    stay: ([[1, 2], [3, 6], [7, 27], [28, 9999]] as const).map(([a, b]) => ({ a, b, v: searches.filter((s) => s.nights >= a && s.nights <= b).length })),
  };
}
