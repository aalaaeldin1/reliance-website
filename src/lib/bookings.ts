import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "./db";
import {
  bookings, calendarDays, listings, messages, payments, payouts, ratePlans, refunds, users, hostProfiles,
  type AdultGuest, type Booking, type BookingStatus,
} from "@/db/schema";
import { quoteStay } from "./pricing";
import { calcRefund } from "./cancellation";
import { addDays, dayStr, nightsBetween, todayUtc } from "./dates";
import { GUEST_FEE_BPS, HOST_FEE_BPS } from "./fees";
import { fmtEgp } from "./money";
import { maskMessage } from "./masking";
import { audit } from "./audit";
import { notifyUser, notifyStaff } from "./notify";
import { paymentsMode } from "./paymob";

export const HOLDING: BookingStatus[] = ["awaiting_payment", "payment_review", "confirmed", "in_stay"];
export const REQUEST_HOURS = 24;
export const PAYMENT_HOURS = Number(process.env.PAYMENT_DEADLINE_HOURS ?? 12);
const app = () => process.env.APP_URL ?? "http://localhost:3000";
const H = 3_600_000;

export class BookingError extends Error {}
export const newReference = () => "RS-" + randomBytes(3).toString("hex").toUpperCase();

/** Dates are free when no holding booking overlaps and no calendar night is blocked. */
export async function isAvailable(tx: Tx | typeof db, listingId: string, checkIn: Date, checkOut: Date, excludeId?: string) {
  const [{ n }] = await tx.select({ n: count() }).from(bookings).where(and(
    eq(bookings.listingId, listingId), inArray(bookings.status, HOLDING),
    lt(bookings.checkIn, checkOut), gt(bookings.checkOut, checkIn),
    excludeId ? ne(bookings.id, excludeId) : undefined,
  ));
  if (n) return false;
  const [{ b }] = await tx.select({ b: count() }).from(calendarDays).where(and(
    eq(calendarDays.listingId, listingId), eq(calendarDays.available, false), gte(calendarDays.date, checkIn), lt(calendarDays.date, checkOut),
  ));
  return b === 0;
}

/** Serialises writes per listing so two guests can never hold the same nights. */
const lockListing = (tx: Tx, listingId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`);

async function priceOverrides(tx: Tx | typeof db, listingId: string, checkIn: Date, checkOut: Date) {
  const days = await tx.select().from(calendarDays).where(and(
    eq(calendarDays.listingId, listingId), gte(calendarDays.date, checkIn), lt(calendarDays.date, checkOut), isNotNull(calendarDays.priceOverride),
  ));
  return Object.fromEntries(days.map((d) => [dayStr(d.date), d.priceOverride as number]));
}

const FEES = { guestBps: GUEST_FEE_BPS, hostBps: HOST_FEE_BPS };

export async function quoteFor(listingId: string, checkIn: Date, checkOut: Date) {
  const rate = await db.query.ratePlans.findFirst({ where: eq(ratePlans.listingId, listingId) });
  if (!rate) throw new BookingError("no_rate");
  return quoteStay(rate, checkIn, checkOut, FEES, await priceOverrides(db, listingId, checkIn, checkOut));
}

const titleOf = (l: { titleEn: string; titleAr: string }) => l.titleEn || l.titleAr;
const datesOf = (b: { checkIn: Date; checkOut: Date }) => `${dayStr(b.checkIn)} → ${dayStr(b.checkOut)}`;
export const hostPayoutOf = (b: Pick<Booking, "baseAmount" | "cleaningFee" | "hostFee">) => b.baseAmount + b.cleaningFee - b.hostFee;

/* ---------------- Guest requests ---------------- */

export async function createRequest(input: { guestId: string; listingId: string; checkIn: Date; checkOut: Date; guests: number; message?: string; locale: string }) {
  const { guestId, listingId, checkIn, checkOut, guests } = input;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new BookingError("dates");
  if (checkIn < todayUtc()) throw new BookingError("past");
  const listing = await db.query.listings.findFirst({ where: eq(listings.id, listingId), with: { rate: true } });
  if (!listing || listing.status !== "live" || !listing.rate) throw new BookingError("not_bookable");
  if (listing.hostId === guestId) throw new BookingError("own_listing");
  if (guests < 1 || guests > listing.maxGuests) throw new BookingError("guests");
  if (nights < listing.rate.minNights) throw new BookingError("min_nights");
  if (nights > listing.rate.maxNights) throw new BookingError("max_nights");
  const [{ open }] = await db.select({ open: count() }).from(bookings).where(and(eq(bookings.guestId, guestId), eq(bookings.status, "requested")));
  if (open >= 3) throw new BookingError("too_many_requests");
  const masked = input.message?.trim() ? maskMessage(input.message) : null;

  const booking = await db.transaction(async (tx) => {
    await lockListing(tx, listingId);
    if (!(await isAvailable(tx, listingId, checkIn, checkOut))) throw new BookingError("unavailable");
    const q = quoteStay(listing.rate!, checkIn, checkOut, FEES, await priceOverrides(tx, listingId, checkIn, checkOut));
    const instant = listing.instantBook;
    const [b] = await tx.insert(bookings).values({
      reference: newReference(), listingId, guestId, checkIn, checkOut, nights, guests,
      message: masked?.text ?? null,
      baseAmount: q.baseAmount, cleaningFee: q.cleaningFee, guestFee: q.guestFee, hostFee: q.hostFee, total: q.total, priceNote: q.note,
      cancellationPolicy: listing.cancellationPolicy,
      status: instant ? "awaiting_payment" : "requested",
      expiresAt: new Date(Date.now() + (instant ? PAYMENT_HOURS : REQUEST_HOURS) * H),
    }).returning();
    if (masked) await tx.insert(messages).values({ bookingId: b.id, senderId: guestId, body: masked.text, flagged: masked.offPlatform });
    await audit(guestId, instant ? "booking.instant" : "booking.request", "Booking", b.id, undefined, { status: b.status }, tx);
    return b;
  });

  if (booking.status === "requested") {
    await notifyUser(listing.hostId, "request_new", {
      listing: titleOf(listing), dates: datesOf(booking), guests, payout: fmtEgp(hostPayoutOf(booking)),
      link: `${app()}/${input.locale}/host/bookings/${booking.id}`,
    });
  } else await notifyAccepted(booking, titleOf(listing), input.locale);
  return booking;
}

async function notifyAccepted(b: Booking, listingTitle: string, locale: string) {
  const online = paymentsMode() !== "manual";
  await notifyUser(b.guestId, online ? "request_accepted_online" : "request_accepted_manual", {
    listing: listingTitle, total: fmtEgp(b.total), ref: b.reference,
    deadline: b.expiresAt ? b.expiresAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
    link: `${app()}/${locale}/trips/${b.id}`,
  });
}

async function loadForHost(bookingId: string, hostId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { listing: true } });
  if (!b || b.listing.hostId !== hostId) throw new BookingError("not_found");
  return b;
}

/* ---------------- Host decisions ---------------- */

export async function acceptRequest(hostId: string, bookingId: string, locale: string) {
  const b0 = await loadForHost(bookingId, hostId);
  if (b0.status !== "requested") throw new BookingError("state");
  if (b0.expiresAt && b0.expiresAt < new Date()) throw new BookingError("expired");
  const b = await db.transaction(async (tx) => {
    await lockListing(tx, b0.listingId);
    if (!(await isAvailable(tx, b0.listingId, b0.checkIn, b0.checkOut, b0.id))) throw new BookingError("unavailable");
    const [u] = await tx.update(bookings).set({ status: "awaiting_payment", expiresAt: new Date(Date.now() + PAYMENT_HOURS * H), updatedAt: new Date() })
      .where(and(eq(bookings.id, b0.id), eq(bookings.status, "requested"))).returning();
    if (!u) throw new BookingError("state");
    await audit(hostId, "booking.accept", "Booking", b0.id, { status: b0.status }, { status: u.status }, tx);
    return u;
  });
  await notifyAccepted(b, titleOf(b0.listing), locale);
  return b;
}

export async function declineRequest(hostId: string, bookingId: string, reason: string, locale: string) {
  const b = await loadForHost(bookingId, hostId);
  if (b.status !== "requested") throw new BookingError("state");
  await db.update(bookings).set({ status: "declined", declineReason: reason.slice(0, 300), updatedAt: new Date() }).where(eq(bookings.id, b.id));
  await audit(hostId, "booking.decline", "Booking", b.id, { status: b.status }, { status: "declined", reason });
  await notifyUser(b.guestId, "request_declined", {
    listing: titleOf(b.listing), link: `${app()}/${locale}/search?area=${b.listing.areaId}&checkIn=${dayStr(b.checkIn)}&checkOut=${dayStr(b.checkOut)}`,
  });
}

/* ---------------- Payments ---------------- */

export async function saveAdults(guestId: string, bookingId: string, adults: AdultGuest[]) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b || b.guestId !== guestId) throw new BookingError("not_found");
  const clean = adults.map((a) => ({ name: a.name.trim().slice(0, 120), idNumber: a.idNumber.trim().slice(0, 40), nationality: a.nationality.trim().slice(0, 60) }));
  if (!clean.length || clean.some((a) => !a.name || !a.idNumber)) throw new BookingError("adults");
  await db.update(bookings).set({ adultGuests: clean, updatedAt: new Date() }).where(eq(bookings.id, b.id));
}

async function loadForGuestPayment(guestId: string, bookingId: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { guest: true, listing: true } });
  if (!b || b.guestId !== guestId) throw new BookingError("not_found");
  if (b.status !== "awaiting_payment") throw new BookingError("state");
  if (b.guest.idStatus !== "verified" && b.guest.idStatus !== "pending") throw new BookingError("id_required");
  if (!b.adultGuests?.length) throw new BookingError("adults");
  return b;
}

export async function submitManualPayment(input: { guestId: string; bookingId: string; method: "instapay" | "bank_transfer"; reference: string; proofKey: string }) {
  const b = await loadForGuestPayment(input.guestId, input.bookingId);
  await db.transaction(async (tx) => {
    await tx.insert(payments).values({ bookingId: b.id, method: input.method, amount: b.total, status: "submitted", proofFileKey: input.proofKey, externalReference: input.reference.slice(0, 100) });
    await tx.update(bookings).set({ status: "payment_review", expiresAt: null, updatedAt: new Date() }).where(eq(bookings.id, b.id));
    await audit(input.guestId, "payment.submit", "Booking", b.id, { status: b.status }, { status: "payment_review" }, tx);
  });
  await notifyStaff(["finance"], "payment_review", { ref: b.reference });
}

/** Creates a pending online payment and returns where to send the guest. */
export async function startOnlinePayment(guestId: string, bookingId: string, locale: string) {
  const b = await loadForGuestPayment(guestId, bookingId);
  const mode = paymentsMode();
  if (mode === "simulate") {
    // Development only: stands in for Paymob's checkout and its confirmed callback.
    if (process.env.NODE_ENV === "production") throw new BookingError("state");
    const [p] = await db.insert(payments).values({ bookingId: b.id, method: "paymob", amount: b.total, status: "pending" }).returning();
    await confirmPayment(p.id, null, `simulated:${Date.now()}`, locale);
    return `/${locale}/trips/${b.id}`;
  }
  const { createIntention } = await import("./paymob");
  const it = await createIntention({
    amountPiastres: b.total, reference: b.reference, bookingId: b.id,
    guest: { name: b.guest.name, phone: b.guest.phone, email: b.guest.email }, itemName: titleOf(b.listing),
  });
  await db.insert(payments).values({ bookingId: b.id, method: "paymob", amount: b.total, status: "pending", paymobIntentionId: it.intentionId, paymobOrderId: it.orderId });
  return it.checkoutUrl;
}

/** Confirms a payment (Finance after matching a statement, or a verified Paymob callback). Idempotent. */
export async function confirmPayment(paymentId: string, actorId: string | null, externalRef?: string, locale = "en") {
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId), with: { booking: { with: { listing: true } } } });
  if (!p) throw new BookingError("not_found");
  if (p.status === "confirmed") return;
  const b = p.booking;
  if (!["awaiting_payment", "payment_review"].includes(b.status)) throw new BookingError("state");
  const host = await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, b.listing.hostId) });
  await db.transaction(async (tx) => {
    await lockListing(tx, b.listingId);
    if (!(await isAvailable(tx, b.listingId, b.checkIn, b.checkOut, b.id))) throw new BookingError("unavailable");
    await tx.update(payments).set({ status: "confirmed", confirmedBy: actorId, confirmedAt: new Date(), externalReference: externalRef ?? p.externalReference }).where(eq(payments.id, p.id));
    await tx.update(bookings).set({ status: "confirmed", expiresAt: null, updatedAt: new Date() }).where(eq(bookings.id, b.id));
    // Payout 24 h after check-in (check-in 15:00 Cairo ≈ 13:00 UTC).
    const dueAt = new Date(addDays(b.checkIn, 1).getTime() + 13 * H);
    await tx.insert(payouts).values({ bookingId: b.id, amount: hostPayoutOf(b), method: host?.payoutMethod ?? "bank", dueAt }).onConflictDoNothing();
    await audit(actorId, "payment.confirm", "Payment", p.id, { status: p.status }, { status: "confirmed", externalRef }, tx);
  });
  const title = titleOf(b.listing);
  await notifyUser(b.guestId, "booking_confirmed_guest", { ref: b.reference, listing: title, dates: datesOf(b), link: `${app()}/${locale}/trips/${b.id}` });
  await notifyUser(b.listing.hostId, "booking_confirmed_host", { ref: b.reference, listing: title, dates: datesOf(b), link: `${app()}/${locale}/host/bookings/${b.id}` });
}

export async function failPayment(paymentId: string, txnId?: string) {
  await db.update(payments).set({ status: "failed", paymobTxnId: txnId }).where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
}

export async function rejectPayment(paymentId: string, actorId: string, reason: string, locale = "en") {
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId), with: { booking: true } });
  if (!p || p.status !== "submitted") throw new BookingError("state");
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "rejected", rejectReason: reason, confirmedBy: actorId }).where(eq(payments.id, p.id));
    await tx.update(bookings).set({ status: "awaiting_payment", expiresAt: new Date(Date.now() + PAYMENT_HOURS * H), updatedAt: new Date() }).where(eq(bookings.id, p.bookingId));
    await audit(actorId, "payment.reject", "Payment", p.id, { status: p.status }, { status: "rejected", reason }, tx);
  });
  await notifyUser(p.booking.guestId, "payment_rejected", { ref: p.booking.reference, reason, link: `${app()}/${locale}/trips/${p.bookingId}` });
}

/* ---------------- Cancellation ---------------- */

const CANCELLABLE: BookingStatus[] = ["requested", "awaiting_payment", "payment_review", "confirmed", "in_stay"];

export async function previewCancel(bookingId: string, by: "guest" | "host" | "admin") {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { payments: true } });
  if (!b) throw new BookingError("not_found");
  const paid = b.payments.some((p) => p.status === "confirmed");
  return paid ? calcRefund(b, new Date(), by) : { refund: 0, keptByHost: 0, feeRefunded: true, rule: "unpaid" };
}

export async function cancelBooking(input: { bookingId: string; actorId: string; by: "guest" | "host" | "admin"; reason?: string }) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, input.bookingId), with: { listing: true, payments: true, payout: true } });
  if (!b) throw new BookingError("not_found");
  if (input.by === "guest" && b.guestId !== input.actorId) throw new BookingError("not_found");
  if (input.by === "host" && b.listing.hostId !== input.actorId) throw new BookingError("not_found");
  if (!CANCELLABLE.includes(b.status)) throw new BookingError("state");
  const calc = await previewCancel(b.id, input.by);
  const paid = calc.rule !== "unpaid";
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ status: "cancelled", cancelledBy: input.by, cancelledAt: new Date(), declineReason: input.reason?.slice(0, 300), expiresAt: null, updatedAt: new Date() }).where(eq(bookings.id, b.id));
    if (paid && calc.refund > 0) await tx.insert(refunds).values({ bookingId: b.id, amount: calc.refund, reason: `${input.by}:${calc.rule}` });
    if (b.payout && b.payout.status !== "sent") {
      const hostAmount = Math.round(calc.keptByHost * (1 - HOST_FEE_BPS / 10_000));
      if (hostAmount > 0) await tx.update(payouts).set({ amount: hostAmount }).where(eq(payouts.id, b.payout.id));
      else await tx.delete(payouts).where(eq(payouts.id, b.payout.id));
    }
    await audit(input.actorId, "booking.cancel", "Booking", b.id, { status: b.status }, { status: "cancelled", by: input.by, refund: calc.refund, rule: calc.rule }, tx);
  });
  const vars = { ref: b.reference, refund: fmtEgp(calc.refund) };
  await notifyUser(b.guestId, "booking_cancelled", vars);
  await notifyUser(b.listing.hostId, "booking_cancelled", vars);
  return calc;
}

/* ---------------- Messages ---------------- */

export async function postMessage(bookingId: string, senderId: string, text: string) {
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), with: { listing: true } });
  if (!b || (b.guestId !== senderId && b.listing.hostId !== senderId)) throw new BookingError("not_found");
  const confirmed = ["confirmed", "in_stay", "completed"].includes(b.status);
  const m = maskMessage(text);
  const body = confirmed ? text.trim().slice(0, 2000) : m.text;
  if (!body) return;
  await db.insert(messages).values({ bookingId, senderId, body, flagged: m.offPlatform });
  const to = senderId === b.guestId ? b.listing.hostId : b.guestId;
  await notifyUser(to, "new_message", { ref: b.reference, link: `${app()}/en/${to === b.guestId ? "trips" : "host/bookings"}/${b.id}` }, { email: false });
}

export { users };
