"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookings, calendarDays, cases, fraudFlags, hostProfiles, kycDocuments, listings, payouts, photos, refunds, searchEvents, users,
  verificationReviews, payments, messages, reviews, ratePlans, sessions, notifications, type StaffRole,
} from "@/db/schema";
import { canDo, getCurrent } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { BookingError, cancelBooking, confirmPayment, rejectPayment } from "@/lib/bookings";
import { fmtEgp } from "@/lib/money";
import { listingTitle } from "@/lib/listings";

async function staff(locale: string, roles: StaffRole[]) {
  const cur = await getCurrent();
  if (!cur || !cur.staff2fa || !canDo(cur.user.staffRole, roles)) redirect(`/${locale}/admin?denied=1`);
  return cur;
}
const loc = (f: FormData) => String(f.get("locale") ?? "en");
const back = (f: FormData, fallback: string) => {
  const b = String(f.get("back") ?? "");
  return b.startsWith(`/${loc(f)}/admin`) ? b : fallback;
};

/* ---------- Listing review ---------- */

const REQUIRED_CHECKS = ["identity", "ownership", "photos", "address", "video"] as const;

export async function decideListingAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const id = String(form.get("listingId"));
  const decision = String(form.get("decision"));
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const reasonCode = String(form.get("reasonCode") ?? "") || null;
  const checks = Object.fromEntries(["identity", "ownership", "photos", "address", "video", "price"].map((k) => [k, form.get(`check_${k}`) === "on"]));
  const x = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!x) redirect(`/${l}/admin/approvals`);
  const host = await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, x.hostId) });
  const go = (err?: string) => redirect(`/${l}/admin/approvals?id=${id}${err ? `&error=${err}` : ""}`);
  if (decision === "approved" && (!REQUIRED_CHECKS.every((k) => checks[k]) || host?.kycStatus !== "verified")) go("checks");
  if (decision !== "approved" && !note) go("note");

  const liveEdit = ["live", "paused"].includes(x.status) && x.hasPendingEdits;
  const recheck = ["live", "paused"].includes(x.status) && !x.hasPendingEdits;
  await db.transaction(async (tx) => {
    if (decision === "approved") {
      const snap = (x.pendingSnapshot ?? {}) as Partial<typeof x>;
      await tx.update(listings).set({
        ...snap, status: x.status === "paused" ? "paused" : "live", hasPendingEdits: false, pendingSnapshot: null, lastVerifiedAt: new Date(), updatedAt: new Date(),
      }).where(eq(listings.id, id));
      await tx.update(photos).set({ pending: false }).where(eq(photos.listingId, id));
    } else if (liveEdit) {
      // Reject the edit only: the approved version stays live.
      await tx.update(listings).set({ hasPendingEdits: false, pendingSnapshot: null }).where(eq(listings.id, id));
      await tx.delete(photos).where(and(eq(photos.listingId, id), eq(photos.pending, true)));
    } else if (recheck && decision === "rejected") {
      await tx.update(listings).set({ status: "suspended" }).where(eq(listings.id, id));
    } else if (!recheck) {
      await tx.update(listings).set({ status: decision === "rejected" ? "rejected" : "changes_requested" }).where(eq(listings.id, id));
    }
    await tx.insert(verificationReviews).values({ listingId: id, reviewerId: cur.user.id, checks, decision, note: note || null, reasonCode });
    await audit(cur.user.id, `listing.${decision}`, "Listing", id, { status: x.status, pendingEdits: x.hasPendingEdits }, { decision, checks, note, reasonCode }, tx);
  });
  const title = listingTitle(x, "en");
  await notifyUser(x.hostId, decision === "approved" ? "listing_approved" : decision === "rejected" ? "listing_rejected" : "listing_changes", { listing: title, note });
  revalidatePath(`/${l}/admin/approvals`);
  redirect(`/${l}/admin/approvals?done=${decision}`);
}

export async function suspendListingAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const id = String(form.get("listingId"));
  const restore = form.get("op") === "restore";
  const note = String(form.get("note") ?? "").slice(0, 500) || (restore ? "restored" : "suspended");
  const x = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!x) redirect(`/${l}/admin/listings`);
  await db.update(listings).set({ status: restore ? "live" : "suspended" }).where(eq(listings.id, id));
  await db.insert(verificationReviews).values({ listingId: id, reviewerId: cur.user.id, checks: {}, decision: restore ? "restored" : "suspended", note });
  await audit(cur.user.id, restore ? "listing.restore" : "listing.suspend", "Listing", id, { status: x.status }, { note });
  if (!restore) await notifyUser(x.hostId, "listing_suspended", { listing: listingTitle(x, "en"), note });
  redirect(back(form, `/${l}/admin/listings`));
}

/* ---------- Identity checks ---------- */

export async function docDecisionAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const docId = String(form.get("docId"));
  const ok = form.get("op") === "approve";
  const reason = String(form.get("reason") ?? "").slice(0, 300) || null;
  await db.update(kycDocuments).set({ status: ok ? "approved" : "rejected", reason: ok ? null : reason, reviewedBy: cur.user.id, reviewedAt: new Date() }).where(eq(kycDocuments.id, docId));
  await audit(cur.user.id, ok ? "kyc_doc.approve" : "kyc_doc.reject", "KycDocument", docId, undefined, { reason });
  redirect(back(form, `/${l}/admin/kyc`));
}

export async function hostKycAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const userId = String(form.get("userId"));
  const ok = form.get("op") === "verify";
  const reason = String(form.get("reason") ?? "").slice(0, 300);
  if (!ok && !reason) redirect(`/${l}/admin/kyc?error=note`);
  await db.update(hostProfiles).set({ kycStatus: ok ? "verified" : "rejected", kycReason: ok ? null : reason }).where(eq(hostProfiles.userId, userId));
  if (ok) {
    await db.update(users).set({ idStatus: "verified", idReason: null }).where(eq(users.id, userId));
    await db.update(kycDocuments).set({ status: "approved", reviewedBy: cur.user.id, reviewedAt: new Date() }).where(and(eq(kycDocuments.userId, userId), eq(kycDocuments.status, "pending")));
  }
  await audit(cur.user.id, ok ? "host.verify" : "host.reject", "HostProfile", userId, undefined, { reason });
  await notifyUser(userId, ok ? "kyc_verified" : "kyc_rejected", { reason });
  redirect(`/${l}/admin/kyc`);
}

export async function guestIdAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const userId = String(form.get("userId"));
  const ok = form.get("op") === "verify";
  const reason = String(form.get("reason") ?? "").slice(0, 300);
  if (!ok && !reason) redirect(`/${l}/admin/kyc?error=note`);
  await db.update(users).set({ idStatus: ok ? "verified" : "rejected", idReason: ok ? null : reason }).where(eq(users.id, userId));
  await db.update(kycDocuments).set({ status: ok ? "approved" : "rejected", reason: ok ? null : reason, reviewedBy: cur.user.id, reviewedAt: new Date() })
    .where(and(eq(kycDocuments.userId, userId), eq(kycDocuments.status, "pending"), inArray(kycDocuments.docType, ["national_id_front", "national_id_back", "passport"])));
  await audit(cur.user.id, ok ? "guest_id.verify" : "guest_id.reject", "User", userId, undefined, { reason });
  await notifyUser(userId, ok ? "id_verified" : "id_rejected", { reason });
  redirect(`/${l}/admin/kyc`);
}

/* ---------- Money ---------- */

export async function paymentDecisionAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["finance"]);
  const id = String(form.get("paymentId"));
  let err = "";
  try {
    if (form.get("op") === "confirm") {
      if (form.get("matched") !== "on") redirect(`/${l}/admin/payments?error=matched`);
      await confirmPayment(id, cur.user.id, String(form.get("statementRef") ?? "") || undefined, l);
    } else {
      const reason = String(form.get("reason") ?? "").trim();
      if (!reason) redirect(`/${l}/admin/payments?error=note`);
      await rejectPayment(id, cur.user.id, reason, l);
    }
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    err = e instanceof BookingError ? e.message : "state";
  }
  redirect(`/${l}/admin/payments${err ? `?error=${err}` : ""}`);
}

export async function payoutSentAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["finance"]);
  const id = String(form.get("payoutId"));
  const ref = String(form.get("transferReference") ?? "").trim().slice(0, 100);
  if (!ref) redirect(`/${l}/admin/payouts?error=note`);
  const p = await db.query.payouts.findFirst({ where: eq(payouts.id, id), with: { booking: { with: { listing: true } } } });
  if (!p || p.status !== "scheduled" || p.dueAt > new Date()) redirect(`/${l}/admin/payouts?error=state`);
  await db.update(payouts).set({ status: "sent", transferReference: ref, sentBy: cur.user.id, sentAt: new Date() }).where(eq(payouts.id, id));
  await audit(cur.user.id, "payout.sent", "Payout", id, { status: p.status }, { ref, amount: p.amount });
  await notifyUser(p.booking.listing.hostId, "payout_sent", { amount: fmtEgp(p.amount), ref: p.booking.reference, transfer: ref });
  redirect(`/${l}/admin/payouts`);
}

export async function refundSentAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["finance"]);
  const id = String(form.get("refundId"));
  const ref = String(form.get("transferReference") ?? "").trim().slice(0, 100);
  if (!ref) redirect(`/${l}/admin/refunds?error=note`);
  await db.update(refunds).set({ status: "sent", transferReference: ref, sentBy: cur.user.id, sentAt: new Date() }).where(and(eq(refunds.id, id), eq(refunds.status, "pending")));
  await audit(cur.user.id, "refund.sent", "Refund", id, undefined, { ref });
  redirect(`/${l}/admin/refunds`);
}

export async function refundOverrideAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["finance"]);
  const bookingId = String(form.get("bookingId"));
  const amount = Math.round(Number(form.get("amount")) * 100);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!amount || amount < 0 || !reason) redirect(`/${l}/admin/refunds?error=note`);
  if (amount > 1_000_000 && cur.user.staffRole !== "super_admin") redirect(`/${l}/admin/refunds?error=limit`);
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!b || amount > b.total) redirect(`/${l}/admin/refunds?error=state`);
  await db.insert(refunds).values({ bookingId, amount, reason: `override:${reason}`, override: true });
  await audit(cur.user.id, "refund.override", "Booking", bookingId, undefined, { amount, reason });
  redirect(`/${l}/admin/refunds`);
}

export async function adminCancelAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["finance", "verifier"]);
  const bookingId = String(form.get("bookingId"));
  try { await cancelBooking({ bookingId, actorId: cur.user.id, by: "admin", reason: String(form.get("reason") ?? "") }); }
  catch { redirect(`/${l}/admin/bookings?error=state`); }
  redirect(`/${l}/admin/bookings?q=${encodeURIComponent(String(form.get("ref") ?? ""))}`);
}

/* ---------- Cases, flags ---------- */

export async function caseAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier", "finance"]);
  const id = String(form.get("caseId"));
  const op = String(form.get("op"));
  if (op === "assign") await db.update(cases).set({ ownerId: cur.user.id, status: "in_progress", updatedAt: new Date() }).where(eq(cases.id, id));
  if (op === "resolve") {
    const resolution = String(form.get("resolution") ?? "").trim().slice(0, 2000);
    if (!resolution) redirect(`/${l}/admin/cases?error=note`);
    await db.update(cases).set({ status: "resolved", resolution, updatedAt: new Date() }).where(eq(cases.id, id));
  }
  await audit(cur.user.id, `case.${op}`, "Case", id);
  redirect(`/${l}/admin/cases`);
}

export async function resolveFlagAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["verifier"]);
  const id = String(form.get("flagId"));
  if (form.get("kind") === "message") await db.update(messages).set({ flagged: false }).where(eq(messages.id, id));
  else await db.update(fraudFlags).set({ resolved: true }).where(eq(fraudFlags.id, id));
  await audit(cur.user.id, "flag.resolve", "Flag", id);
  redirect(`/${l}/admin/flags`);
}

/* ---------- Users & staff (super admin) ---------- */

export async function userAdminAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["super_admin"]);
  const userId = String(form.get("userId"));
  const op = String(form.get("op"));
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || u.id === cur.user.id) redirect(`/${l}/admin/users`);
  if (op === "role") {
    const role = (["none", "verifier", "finance", "super_admin"] as const).find((r) => r === form.get("role")) ?? "none";
    await db.update(users).set({ staffRole: role, totpSecret: role === "none" ? null : u.totpSecret }).where(eq(users.id, userId));
    await audit(cur.user.id, "user.role", "User", userId, { role: u.staffRole }, { role });
  } else if (op === "suspend") {
    const reason = String(form.get("reason") ?? "").slice(0, 300) || "suspended";
    await db.update(users).set({ suspendedAt: new Date(), suspendReason: reason }).where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.update(listings).set({ status: "suspended" }).where(and(eq(listings.hostId, userId), inArray(listings.status, ["live", "paused", "pending"])));
    await audit(cur.user.id, "user.suspend", "User", userId, undefined, { reason });
  } else if (op === "restore") {
    await db.update(users).set({ suspendedAt: null, suspendReason: null }).where(eq(users.id, userId));
    await audit(cur.user.id, "user.restore", "User", userId);
  } else if (op === "reset2fa") {
    await db.update(users).set({ totpSecret: null }).where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await audit(cur.user.id, "user.reset_2fa", "User", userId);
  }
  redirect(`/${l}/admin/users?q=${encodeURIComponent(u.phone)}`);
}

/** Deletes every record created by the seed script (flagged sample = true). */
export async function removeSampleDataAction(form: FormData) {
  const l = loc(form);
  const cur = await staff(l, ["super_admin"]);
  if (form.get("confirm") !== "yes") redirect(`/${l}/admin/settings`);
  await db.transaction(async (tx) => {
    const sl = (await tx.select({ id: listings.id }).from(listings).where(eq(listings.sample, true))).map((r) => r.id);
    const sb = (await tx.select({ id: bookings.id }).from(bookings).where(sl.length ? or(eq(bookings.sample, true), inArray(bookings.listingId, sl)) : eq(bookings.sample, true))).map((r) => r.id);
    const su = (await tx.select({ id: users.id }).from(users).where(eq(users.sample, true))).map((r) => r.id);
    if (sb.length) {
      await tx.delete(payments).where(inArray(payments.bookingId, sb));
      await tx.delete(payouts).where(inArray(payouts.bookingId, sb));
      await tx.delete(refunds).where(inArray(refunds.bookingId, sb));
      await tx.delete(reviews).where(inArray(reviews.bookingId, sb));
      await tx.delete(cases).where(inArray(cases.bookingId, sb));
      await tx.delete(messages).where(inArray(messages.bookingId, sb));
      await tx.delete(bookings).where(inArray(bookings.id, sb));
    }
    await tx.delete(searchEvents).where(eq(searchEvents.sample, true));
    if (sl.length) {
      await tx.delete(calendarDays).where(inArray(calendarDays.listingId, sl));
      await tx.delete(verificationReviews).where(inArray(verificationReviews.listingId, sl));
      await tx.delete(fraudFlags).where(inArray(fraudFlags.listingId, sl));
      await tx.delete(photos).where(inArray(photos.listingId, sl));
      await tx.delete(ratePlans).where(inArray(ratePlans.listingId, sl));
      await tx.delete(listings).where(inArray(listings.id, sl));
    }
    if (su.length) {
      await tx.delete(notifications).where(inArray(notifications.userId, su));
      await tx.delete(users).where(inArray(users.id, su));
    }
    await audit(cur.user.id, "sample.remove", "System", "sample", undefined, { listings: sl.length, bookings: sb.length, users: su.length }, tx);
  });
  redirect(`/${l}/admin`);
}
