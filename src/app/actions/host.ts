"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { calendarDays, hostProfiles, kycDocuments, listings, photos, ratePlans } from "@/db/schema";
import { getCurrent } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { saveDocument, savePhoto } from "@/lib/storage";
import { scanListing } from "@/lib/fraud";
import { audit } from "@/lib/audit";
import { importCalendar } from "@/lib/ical";
import { acceptRequest, BookingError, cancelBooking, declineRequest } from "@/lib/bookings";
import { suggestionFor } from "@/lib/listings";
import { addDays, parseDay } from "@/lib/dates";
import { AREAS, AMENITIES, LISTING_TYPES } from "@/lib/areas";
import { notifyStaff } from "@/lib/notify";

async function requireHostUser(locale: string) {
  const cur = await getCurrent();
  if (!cur) redirect(`/${locale}/sign-in?next=/${locale}/host`);
  return cur;
}
async function ownListing(id: string, hostId: string) {
  const l = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!l || l.hostId !== hostId) throw new Error("not_found");
  return l;
}

/* ---------- Profile & verification ---------- */

export async function createHostProfileAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const parsed = z.object({
    hostType: z.enum(["owner", "tenant", "manager"]), displayName: z.string().trim().min(2).max(80),
    payoutMethod: z.enum(["bank", "instapay", "wallet"]), payoutAccount: z.string().trim().min(5).max(60), agree: z.literal("on"),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid" };
  const d = parsed.data;
  await db.insert(hostProfiles).values({
    userId: cur.user.id, hostType: d.hostType, displayName: d.displayName, payoutMethod: d.payoutMethod,
    payoutAccountEnc: encrypt(d.payoutAccount), agreementAcceptedAt: new Date(), kycStatus: "pending",
  }).onConflictDoNothing();
  await audit(cur.user.id, "host.create", "HostProfile", cur.user.id, undefined, { hostType: d.hostType });
  revalidatePath(`/${locale}/host`);
  return {};
}

const DOC_TYPES = ["national_id_front", "national_id_back", "passport", "title_deed", "utility_bill", "lease", "landlord_consent", "management_agreement", "owner_id", "compound_consent"] as const;

export async function uploadHostDocAction(_: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const docType = DOC_TYPES.find((d) => d === form.get("docType"));
  const file = form.get("file");
  if (!docType || !(file instanceof File) || !file.size) return { error: "invalid" };
  try {
    const key = await saveDocument(`kyc/${cur.user.id}`, file);
    await db.delete(kycDocuments).where(and(eq(kycDocuments.userId, cur.user.id), eq(kycDocuments.docType, docType), eq(kycDocuments.status, "pending")));
    await db.insert(kycDocuments).values({ userId: cur.user.id, docType, fileKey: key });
    await db.update(hostProfiles).set({ kycStatus: "pending" }).where(and(eq(hostProfiles.userId, cur.user.id), eq(hostProfiles.kycStatus, "rejected")));
  } catch { return { error: "file" }; }
  revalidatePath(`/${locale}/host`);
  return { ok: true };
}

export async function bookVideoCallAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const at = new Date(String(form.get("slot")));
  if (isNaN(at.getTime()) || at < new Date()) redirect(`/${locale}/host`);
  await db.update(hostProfiles).set({ videoCallAt: at }).where(eq(hostProfiles.userId, cur.user.id));
  await notifyStaff(["verifier"], "video_call", { time: at.toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) + " · " + cur.user.phone });
  revalidatePath(`/${locale}/host`);
  redirect(`/${locale}/host`);
}

/* ---------- Listings ---------- */

const egp = z.coerce.number().min(0).max(10_000_000);
const optEgp = z.union([z.literal(""), egp]).transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));
const ListingInput = z.object({
  titleEn: z.string().trim().max(80).default(""), titleAr: z.string().trim().max(80).default(""),
  type: z.enum(LISTING_TYPES), areaId: z.string().refine((v) => AREAS.some((a) => a.id === v)),
  address: z.string().trim().min(5).max(200), floor: z.string().trim().max(10).optional().default(""),
  lat: z.union([z.literal(""), z.coerce.number().min(29).max(31)]).optional(), lng: z.union([z.literal(""), z.coerce.number().min(30).max(32.5)]).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20), beds: z.coerce.number().int().min(1).max(30), baths: z.coerce.number().int().min(1).max(20),
  maxGuests: z.coerce.number().int().min(1).max(30), sizeM2: z.union([z.literal(""), z.coerce.number().int().min(10).max(5000)]).optional(),
  descriptionEn: z.string().trim().max(3000).default(""), descriptionAr: z.string().trim().max(3000).default(""),
  houseRules: z.string().trim().max(2000).default(""), checkInTime: z.string().regex(/^\d{2}:\d{2}$/), checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  cancellationPolicy: z.enum(["flexible", "moderate", "firm"]), instantBook: z.enum(["0", "1"]),
  nightly: egp.refine((v) => v >= 200), weekend: optEgp, weeklyDiscount: z.coerce.number().int().min(0).max(50), monthly: optEgp, cleaningFee: optEgp,
  minNights: z.coerce.number().int().min(1).max(90), maxNights: z.coerce.number().int().min(1).max(365),
});

export type SaveState = { error?: string; fields?: string[]; id?: string; ok?: boolean };

export async function saveListingAction(_: SaveState, form: FormData): Promise<SaveState> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const profile = await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, cur.user.id) });
  if (!profile) return { error: "profile" };
  const parsed = ListingInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
  const d = parsed.data;
  if (!d.titleEn && !d.titleAr) return { error: "invalid", fields: ["titleEn"] };
  if (!d.descriptionEn && !d.descriptionAr) return { error: "invalid", fields: ["descriptionEn"] };
  const amenities = form.getAll("amenities").map(String).filter((a) => (AMENITIES as readonly string[]).includes(a));
  const submit = form.get("intent") === "submit";
  const id = String(form.get("id") ?? "");
  const lat = d.lat === "" || d.lat === undefined ? null : d.lat, lng = d.lng === "" || d.lng === undefined ? null : d.lng;
  const base = {
    titleEn: d.titleEn, titleAr: d.titleAr, descriptionEn: d.descriptionEn, descriptionAr: d.descriptionAr, houseRules: d.houseRules, amenities,
    checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, cancellationPolicy: d.cancellationPolicy, instantBook: d.instantBook === "1", beds: d.beds, baths: d.baths,
    sizeM2: d.sizeM2 === "" || d.sizeM2 === undefined ? null : d.sizeM2, updatedAt: new Date(),
  };
  const material = { areaId: d.areaId, type: d.type, address: d.address, floor: d.floor || null, lat, lng, bedrooms: d.bedrooms, maxGuests: d.maxGuests };
  const rate = {
    nightly: Math.round(d.nightly * 100), weekend: d.weekend, weeklyDiscount: d.weeklyDiscount, monthly: d.monthly, cleaningFee: d.cleaningFee ?? 0,
    minNights: d.minNights, maxNights: Math.max(d.minNights, d.maxNights),
  };

  let listingId = id;
  if (!id) {
    const [row] = await db.insert(listings).values({ hostId: cur.user.id, ...base, ...material, status: "draft" }).returning();
    listingId = row.id;
    await db.insert(ratePlans).values({ listingId, ...rate });
    await audit(cur.user.id, "listing.create", "Listing", listingId);
  } else {
    const l = await ownListing(id, cur.user.id).catch(() => null);
    if (!l) return { error: "not_found" };
    const live = ["live", "paused"].includes(l.status);
    const changed = Object.entries(material).some(([k, v]) => (l as Record<string, unknown>)[k] !== v);
    if (live && changed) {
      await db.update(listings).set({ ...base, pendingSnapshot: material, hasPendingEdits: true, submittedAt: new Date() }).where(eq(listings.id, id));
    } else {
      await db.update(listings).set({ ...base, ...material }).where(eq(listings.id, id));
    }
    await db.insert(ratePlans).values({ listingId: id, ...rate }).onConflictDoUpdate({ target: ratePlans.listingId, set: rate });
    await audit(cur.user.id, "listing.update", "Listing", id, { status: l.status }, { pendingEdits: live && changed });
  }

  if (submit) {
    const l = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
    const [{ n }] = await db.select({ n: count() }).from(photos).where(eq(photos.listingId, listingId));
    if (n < 5) return { error: "photos", id: listingId };
    if (l && ["draft", "changes_requested", "rejected"].includes(l.status)) {
      await db.update(listings).set({ status: "pending", submittedAt: new Date() }).where(eq(listings.id, listingId));
      await audit(cur.user.id, "listing.submit", "Listing", listingId, { status: l.status }, { status: "pending" });
    }
    await scanListing(listingId);
    revalidatePath(`/${locale}/host`);
    redirect(`/${locale}/host?submitted=1`);
  }
  revalidatePath(`/${locale}/host/listings/${listingId}/edit`);
  if (!id) redirect(`/${locale}/host/listings/${listingId}/edit?saved=1`);
  return { ok: true, id: listingId };
}

export async function suggestAction(areaId: string, bedrooms: number, excludeId?: string) {
  if (!AREAS.some((a) => a.id === areaId)) return null;
  return suggestionFor(areaId, Math.max(0, Math.min(20, bedrooms || 0)), excludeId || undefined);
}

export async function uploadPhotosAction(_: { error?: string; added?: number }, form: FormData): Promise<{ error?: string; added?: number }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const id = String(form.get("listingId"));
  const l = await ownListing(id, cur.user.id).catch(() => null);
  if (!l) return { error: "not_found" };
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 30);
  const [{ n: have }] = await db.select({ n: count() }).from(photos).where(eq(photos.listingId, id));
  const [{ m }] = await db.select({ m: max(photos.sortOrder) }).from(photos).where(eq(photos.listingId, id));
  let order = (m ?? -1) + 1, added = 0, error: string | undefined;
  for (const f of files) {
    if (have + added >= 30) break;
    try {
      const saved = await savePhoto(id, f);
      await db.insert(photos).values({ listingId: id, ...saved, sortOrder: order++, pending: ["live", "paused"].includes(l.status) });
      added++;
    } catch (e) { error = e instanceof Error ? e.message : "photo_type"; }
  }
  if (added && ["live", "paused"].includes(l.status)) await db.update(listings).set({ hasPendingEdits: true, submittedAt: new Date() }).where(eq(listings.id, id));
  if (added) await scanListing(id);
  revalidatePath(`/${locale}/host/listings/${id}/edit`);
  return { added, error };
}

export async function photoAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const id = String(form.get("listingId"));
  await ownListing(id, cur.user.id);
  const photoId = String(form.get("photoId"));
  const op = String(form.get("op"));
  const all = await db.select().from(photos).where(eq(photos.listingId, id)).orderBy(asc(photos.sortOrder));
  const i = all.findIndex((p) => p.id === photoId);
  if (i < 0) redirect(`/${locale}/host/listings/${id}/edit`);
  if (op === "delete") await db.delete(photos).where(eq(photos.id, photoId));
  if (op === "first" || op === "up") {
    const j = op === "first" ? 0 : Math.max(0, i - 1);
    const reordered = [...all]; const [p] = reordered.splice(i, 1); reordered.splice(j, 0, p);
    for (const [k, ph] of reordered.entries()) await db.update(photos).set({ sortOrder: k }).where(eq(photos.id, ph.id));
  }
  revalidatePath(`/${locale}/host/listings/${id}/edit`);
  redirect(`/${locale}/host/listings/${id}/edit`);
}

export async function pauseListingAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const l = await ownListing(String(form.get("listingId")), cur.user.id);
  const to = l.status === "live" ? "paused" : l.status === "paused" ? "live" : null;
  if (to) {
    await db.update(listings).set({ status: to }).where(eq(listings.id, l.id));
    await audit(cur.user.id, `listing.${to === "paused" ? "pause" : "resume"}`, "Listing", l.id);
  }
  revalidatePath(`/${locale}/host`);
  redirect(`/${locale}/host`);
}

/* ---------- Calendar ---------- */

export async function calendarAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const id = String(form.get("listingId"));
  await ownListing(id, cur.user.id);
  const op = String(form.get("op"));
  const back = `/${locale}/host/listings/${id}/calendar${form.get("month") ? `?month=${form.get("month")}` : ""}`;
  try {
    if (op === "toggle") {
      const date = parseDay(String(form.get("date")));
      const existing = await db.query.calendarDays.findFirst({ where: and(eq(calendarDays.listingId, id), eq(calendarDays.date, date)) });
      const available = existing ? !existing.available : false;
      await db.insert(calendarDays).values({ listingId: id, date, available, source: "host" })
        .onConflictDoUpdate({ target: [calendarDays.listingId, calendarDays.date], set: { available, source: "host" } });
    } else if (op === "range") {
      const from = parseDay(String(form.get("from"))), to = parseDay(String(form.get("to")));
      const raw = String(form.get("price") ?? "").trim();
      const price = raw ? Math.round(Number(raw) * 100) : null;
      const action = String(form.get("rangeAction") ?? "price");
      for (let d = from, i = 0; d <= to && i < 366; d = addDays(d, 1), i++) {
        const set = action === "block" ? { available: false, source: "host" } : action === "open" ? { available: true, source: "host" } : { priceOverride: price };
        await db.insert(calendarDays).values({ listingId: id, date: d, ...set }).onConflictDoUpdate({ target: [calendarDays.listingId, calendarDays.date], set });
      }
    } else if (op === "ical") {
      const url = String(form.get("icalUrl") ?? "").trim();
      await db.update(listings).set({ icalImportUrl: url.startsWith("https://") ? url : null }).where(eq(listings.id, id));
      if (url.startsWith("https://")) {
        const r = await importCalendar(id);
        redirect(`${back}${back.includes("?") ? "&" : "?"}synced=${r.ok ? r.nights : "error"}`);
      }
    } else if (op === "sync") {
      const r = await importCalendar(id);
      redirect(`${back}${back.includes("?") ? "&" : "?"}synced=${r.ok ? r.nights : "error"}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
  }
  revalidatePath(back);
  redirect(back);
}

/* ---------- Bookings ---------- */

export async function hostBookingAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireHostUser(locale);
  const bookingId = String(form.get("bookingId"));
  const op = String(form.get("op"));
  let err = "";
  try {
    if (op === "accept") await acceptRequest(cur.user.id, bookingId, locale);
    else if (op === "decline") await declineRequest(cur.user.id, bookingId, String(form.get("reason") ?? ""), locale);
    else if (op === "cancel") await cancelBooking({ bookingId, actorId: cur.user.id, by: "host", reason: String(form.get("reason") ?? "") });
  } catch (e) { err = e instanceof BookingError ? e.message : "state"; }
  revalidatePath(`/${locale}/host`);
  redirect(`/${locale}/host/bookings/${bookingId}${err ? `?error=${err}` : ""}`);
}
