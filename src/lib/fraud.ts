import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "./db";
import { fraudFlags, listings, photos } from "@/db/schema";
import { hamming } from "./phash";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Flag a listing that shares an address or a near-identical photo with another listing. */
export async function scanListing(listingId: string) {
  const l = await db.query.listings.findFirst({ where: eq(listings.id, listingId), with: { photos: true } });
  if (!l) return [];
  const flags: { kind: string; detail: string }[] = [];
  const others = await db.select({ id: listings.id, address: listings.address, floor: listings.floor, titleEn: listings.titleEn, titleAr: listings.titleAr })
    .from(listings).where(and(ne(listings.id, l.id), ne(listings.status, "draft")));
  const mine = norm(`${l.address} ${l.floor ?? ""}`);
  for (const o of others)
    if (mine.length > 6 && norm(`${o.address} ${o.floor ?? ""}`) === mine)
      flags.push({ kind: "duplicate_address", detail: `Same address as "${o.titleEn || o.titleAr}" (${o.id})` });
  if (l.photos.length) {
    const theirs = await db.select({ listingId: photos.listingId, phash: photos.phash }).from(photos).where(ne(photos.listingId, l.id));
    const hit = new Set<string>();
    for (const p of l.photos) for (const q of theirs) if (!hit.has(q.listingId) && hamming(p.phash, q.phash) <= 6) hit.add(q.listingId);
    for (const id of hit) flags.push({ kind: "duplicate_photo", detail: `A photo matches a photo on listing ${id}` });
  }
  await db.delete(fraudFlags).where(and(eq(fraudFlags.listingId, l.id), eq(fraudFlags.resolved, false), inArray(fraudFlags.kind, ["duplicate_address", "duplicate_photo"])));
  if (flags.length) await db.insert(fraudFlags).values(flags.map((f) => ({ ...f, listingId: l.id })));
  return flags;
}
