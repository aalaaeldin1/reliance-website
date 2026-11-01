import "server-only";
import { and, between, eq, ne } from "drizzle-orm";
import { db } from "./db";
import { areas, listings, ratePlans } from "@/db/schema";
import { BENCHMARK_ADR, fairness, suggestedNightly } from "./pricing";
import { AREAS } from "./areas";

export type PeerScope = "area" | "governorate" | "benchmark";

/** Nightly prices of live homes of similar size (±1 bedroom): same area, else same governorate. */
export async function peerPrices(areaId: string, bedrooms: number, excludeId?: string): Promise<{ prices: number[]; scope: PeerScope }> {
  const size = between(listings.bedrooms, Math.max(0, bedrooms - 1), bedrooms + 1);
  const notMe = excludeId ? ne(listings.id, excludeId) : undefined;
  const inArea = await db.select({ p: ratePlans.nightly }).from(ratePlans).innerJoin(listings, eq(listings.id, ratePlans.listingId))
    .where(and(eq(listings.areaId, areaId), eq(listings.status, "live"), size, notMe));
  if (inArea.length) return { prices: inArea.map((r) => r.p), scope: "area" };
  const gov = AREAS.find((a) => a.id === areaId)?.governorate ?? "Cairo";
  const inGov = await db.select({ p: ratePlans.nightly }).from(ratePlans).innerJoin(listings, eq(listings.id, ratePlans.listingId)).innerJoin(areas, eq(areas.id, listings.areaId))
    .where(and(eq(areas.governorate, gov), eq(listings.status, "live"), size, notMe));
  return inGov.length >= 2 ? { prices: inGov.map((r) => r.p), scope: "governorate" } : { prices: [], scope: "benchmark" };
}

export async function fairnessFor(l: { id: string; areaId: string; bedrooms: number }, nightly: number) {
  const gov = AREAS.find((a) => a.id === l.areaId)?.governorate ?? "Cairo";
  const { prices, scope } = await peerPrices(l.areaId, l.bedrooms, l.id);
  return { ...fairness(nightly, prices, suggestedNightly(gov, l.bedrooms, [])), scope, gov, benchmark: BENCHMARK_ADR[gov] };
}

export async function suggestionFor(areaId: string, bedrooms: number, excludeId?: string) {
  const gov = AREAS.find((a) => a.id === areaId)?.governorate ?? "Cairo";
  const { prices, scope } = await peerPrices(areaId, bedrooms, excludeId);
  return { value: suggestedNightly(gov, bedrooms, prices), scope, count: prices.length, gov };
}

export const listingTitle = (l: { titleEn: string; titleAr: string }, locale: string) =>
  (locale === "ar" ? l.titleAr || l.titleEn : l.titleEn || l.titleAr) || "—";
export const listingDescription = (l: { descriptionEn: string; descriptionAr: string }, locale: string) =>
  locale === "ar" ? l.descriptionAr || l.descriptionEn : l.descriptionEn || l.descriptionAr;
