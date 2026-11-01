"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, cases, kycDocuments, reviews, users } from "@/db/schema";
import { getCurrent } from "@/lib/auth";
import { parseDay } from "@/lib/dates";
import {
  BookingError, cancelBooking, createRequest, isAvailable, postMessage, quoteFor, saveAdults, startOnlinePayment, submitManualPayment,
} from "@/lib/bookings";
import { saveDocument } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import type { Quote } from "@/lib/pricing";

const errCode = (e: unknown) => (e instanceof BookingError ? e.message : (console.error(e), "error"));

export async function quoteAction(listingId: string, checkIn: string, checkOut: string): Promise<{ quote?: Quote; error?: string }> {
  try {
    const a = parseDay(checkIn), b = parseDay(checkOut);
    if (b <= a) return { error: "dates" };
    const quote = await quoteFor(listingId, a, b);
    if (!(await isAvailable(db, listingId, a, b))) return { quote, error: "unavailable" };
    return { quote };
  } catch (e) {
    return { error: e instanceof BookingError ? e.message : "dates" };
  }
}

export async function requestBookingAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const locale = String(form.get("locale") ?? "en");
  const listingId = String(form.get("listingId"));
  const cur = await getCurrent();
  if (!cur) redirect(`/${locale}/sign-in?next=/${locale}/listings/${listingId}`);
  let id: string;
  try {
    const b = await createRequest({
      guestId: cur.user.id, listingId, locale,
      checkIn: parseDay(String(form.get("checkIn"))), checkOut: parseDay(String(form.get("checkOut"))),
      guests: Number(form.get("guests")) || 1, message: String(form.get("message") ?? "").slice(0, 1000),
    });
    id = b.id;
  } catch (e) {
    return { error: e instanceof Error && e.message === "Invalid date" ? "dates" : errCode(e) };
  }
  redirect(`/${locale}/trips/${id}`);
}

async function requireGuest(locale: string) {
  const cur = await getCurrent();
  if (!cur) redirect(`/${locale}/sign-in`);
  return cur;
}

export async function saveAdultsAction(_: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const names = form.getAll("adultName").map(String), ids = form.getAll("adultId").map(String), nats = form.getAll("adultNat").map(String);
  const adults = names.map((name, i) => ({ name, idNumber: ids[i] ?? "", nationality: nats[i] ?? "" })).filter((a) => a.name.trim() || a.idNumber.trim());
  try {
    await saveAdults(cur.user.id, String(form.get("bookingId")), adults);
  } catch (e) { return { error: errCode(e) }; }
  revalidatePath(`/${locale}/trips/${form.get("bookingId")}`);
  return { ok: true };
}

export async function payOnlineAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  let url: string;
  try { url = await startOnlinePayment(cur.user.id, bookingId, locale); }
  catch (e) { redirect(`/${locale}/trips/${bookingId}?error=${errCode(e)}`); }
  redirect(url);
}

export async function payManualAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  const file = form.get("proof");
  const method = form.get("method") === "bank_transfer" ? "bank_transfer" : "instapay";
  if (!(file instanceof File) || !file.size) return { error: "proof" };
  try {
    const key = await saveDocument(`payments/${bookingId}`, file);
    await submitManualPayment({ guestId: cur.user.id, bookingId, method, reference: String(form.get("reference") ?? ""), proofKey: key });
  } catch (e) { return { error: e instanceof Error && e.message.startsWith("doc_") ? "proof" : errCode(e) }; }
  revalidatePath(`/${locale}/trips/${bookingId}`);
  return {};
}

export async function cancelAsGuestAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  try { await cancelBooking({ bookingId, actorId: cur.user.id, by: "guest", reason: "guest_cancelled" }); }
  catch (e) { redirect(`/${locale}/trips/${bookingId}?error=${errCode(e)}`); }
  redirect(`/${locale}/trips/${bookingId}`);
}

export async function messageAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  const back = String(form.get("back") ?? `/${locale}/trips/${bookingId}`);
  try { await postMessage(bookingId, cur.user.id, String(form.get("body") ?? "")); } catch { /* not a party to the booking */ }
  revalidatePath(back);
  redirect(back.startsWith(`/${locale}/`) ? back : `/${locale}`);
}

export async function reviewAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  const back = String(form.get("back") ?? `/${locale}/trips/${bookingId}`);
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { listing: true } });
  if (!b || b.status !== "completed") redirect(back);
  const asGuest = b.guestId === cur.user.id, asHost = b.listing.hostId === cur.user.id;
  if (!asGuest && !asHost) redirect(back);
  const rating = Math.min(5, Math.max(1, Number(form.get("rating")) || 5));
  await db.insert(reviews).values({
    bookingId, authorId: cur.user.id, subjectId: asGuest ? b.listing.hostId : b.guestId, role: asGuest ? "guest_to_host" : "host_to_guest",
    rating, comment: String(form.get("comment") ?? "").slice(0, 2000),
  }).onConflictDoNothing();
  revalidatePath(back);
  redirect(back);
}

export async function reportAction(form: FormData) {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const bookingId = String(form.get("bookingId"));
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { listing: true } });
  if (!b || (b.guestId !== cur.user.id && b.listing.hostId !== cur.user.id)) redirect(`/${locale}`);
  const urgent = form.get("urgent") === "on";
  const category = String(form.get("category") ?? "other").slice(0, 40);
  const [c] = await db.insert(cases).values({ bookingId, openedById: cur.user.id, category, priority: urgent ? "urgent" : "normal", details: String(form.get("details") ?? "").slice(0, 4000) }).returning();
  await audit(cur.user.id, "case.open", "Case", c.id, undefined, { bookingId, category, urgent });
  if (urgent) await notifyStaff(["verifier", "finance"], "case_urgent", { ref: b.reference, category });
  redirect(`/${locale}/trips/${bookingId}?reported=1`);
}

/* ---------- Account ---------- */

export async function profileAction(_: { ok?: boolean }, form: FormData): Promise<{ ok?: boolean }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const lang = form.get("language") === "ar" ? "ar" : "en";
  const email = String(form.get("email") ?? "").trim();
  await db.update(users).set({
    name: String(form.get("name") ?? cur.user.name).trim().slice(0, 120) || cur.user.name,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null, language: lang,
  }).where(eq(users.id, cur.user.id));
  revalidatePath(`/${locale}/account`);
  return { ok: true };
}

export async function uploadIdAction(_: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await requireGuest(locale);
  const kind = form.get("kind") === "passport" ? "passport" : "national_id";
  const front = form.get("front"), back = form.get("back");
  if (!(front instanceof File) || !front.size) return { error: "front" };
  if (kind === "national_id" && (!(back instanceof File) || !back.size)) return { error: "back" };
  try {
    await db.delete(kycDocuments).where(and(eq(kycDocuments.userId, cur.user.id), eq(kycDocuments.status, "pending")));
    const k1 = await saveDocument(`ids/${cur.user.id}`, front);
    await db.insert(kycDocuments).values({ userId: cur.user.id, docType: kind === "passport" ? "passport" : "national_id_front", fileKey: k1 });
    if (kind === "national_id") {
      const k2 = await saveDocument(`ids/${cur.user.id}`, back as File);
      await db.insert(kycDocuments).values({ userId: cur.user.id, docType: "national_id_back", fileKey: k2 });
    }
    if (cur.user.idStatus !== "verified") await db.update(users).set({ idStatus: "pending", idReason: null }).where(eq(users.id, cur.user.id));
  } catch { return { error: "file" }; }
  revalidatePath(`/${locale}/account`);
  return { ok: true };
}
