import "server-only";
import { and, count, eq, gt, inArray, isNotNull, isNull, like, lt, lte, sql, avg } from "drizzle-orm";
import { db } from "./db";
import { bookings, cases, listings, notifications, payouts, reviews, settings } from "@/db/schema";
import { addDays, todayUtc } from "./dates";
import { notifyUser } from "./notify";
import { fmtEgp } from "./money";
import { importCalendar } from "./ical";

const app = () => process.env.APP_URL ?? "http://localhost:3000";
const title = (l: { titleEn: string; titleAr: string }) => l.titleEn || l.titleAr;
const H = 3_600_000;

async function sentBefore(template: string, ref: string) {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.template, template), like(notifications.body, `%${ref}%`)));
  return n > 0;
}
async function getSetting(key: string) {
  return (await db.query.settings.findFirst({ where: eq(settings.key, key) }))?.value;
}
async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Time-based transitions. Idempotent; run every few minutes. */
export async function runTick(now = new Date()) {
  const log: string[] = [];
  const today = todayUtc(now);

  // 1. Requests the host didn't answer, and payments not made in time.
  const stale = await db.query.bookings.findMany({ where: and(inArray(bookings.status, ["requested", "awaiting_payment"]), lt(bookings.expiresAt, now)), with: { listing: true } });
  for (const b of stale) {
    await db.update(bookings).set({ status: "expired", updatedAt: now }).where(eq(bookings.id, b.id));
    await notifyUser(b.guestId, "request_expired", { listing: title(b.listing), link: `${app()}/en/search?area=${b.listing.areaId}` });
    log.push(`expired ${b.reference}`);
  }

  // 2. Reminders: host 4 h before a request expires; guest 2 h before the payment deadline.
  const soonReq = await db.query.bookings.findMany({ where: and(eq(bookings.status, "requested"), lt(bookings.expiresAt, new Date(now.getTime() + 4 * H)), gt(bookings.expiresAt, now)), with: { listing: true } });
  for (const b of soonReq)
    if (!(await sentBefore("request_reminder", b.reference)))
      await notifyUser(b.listing.hostId, "request_reminder", { listing: `${title(b.listing)} (${b.reference})`, link: `${app()}/en/host/bookings/${b.id}` });
  const soonPay = await db.query.bookings.findMany({ where: and(eq(bookings.status, "awaiting_payment"), lt(bookings.expiresAt, new Date(now.getTime() + 2 * H)), gt(bookings.expiresAt, now)) });
  for (const b of soonPay)
    if (!(await sentBefore("payment_reminder", b.reference)))
      await notifyUser(b.guestId, "payment_reminder", { total: fmtEgp(b.total), ref: b.reference, link: `${app()}/en/trips/${b.id}` });

  // 3. Check-in tomorrow.
  const arriving = await db.query.bookings.findMany({ where: and(eq(bookings.status, "confirmed"), eq(bookings.checkIn, addDays(today, 1))), with: { listing: true } });
  for (const b of arriving)
    if (!(await sentBefore("checkin_tomorrow_guest", b.reference))) {
      await notifyUser(b.guestId, "checkin_tomorrow_guest", { listing: `${title(b.listing)} (${b.reference})`, time: b.listing.checkInTime, link: `${app()}/en/trips/${b.id}` });
      await notifyUser(b.listing.hostId, "checkin_tomorrow_host", { listing: `${title(b.listing)} (${b.reference})`, link: `${app()}/en/host/bookings/${b.id}` });
    }

  // 4. Stays start and end.
  const started = await db.update(bookings).set({ status: "in_stay", updatedAt: now }).where(and(eq(bookings.status, "confirmed"), lte(bookings.checkIn, today))).returning({ id: bookings.id });
  if (started.length) log.push(`in_stay ${started.length}`);
  const ending = await db.query.bookings.findMany({ where: and(eq(bookings.status, "in_stay"), lte(bookings.checkOut, today)), with: { listing: true } });
  for (const b of ending) {
    await db.update(bookings).set({ status: "completed", updatedAt: now }).where(eq(bookings.id, b.id));
    await notifyUser(b.guestId, "review_request", { listing: title(b.listing), link: `${app()}/en/trips/${b.id}#review` });
    log.push(`completed ${b.reference}`);
  }

  // 5. Payouts: hold while a case is open; release the hold when it closes.
  const pending = await db.select({ id: payouts.id, status: payouts.status, bookingId: payouts.bookingId }).from(payouts).where(inArray(payouts.status, ["scheduled", "held"]));
  for (const p of pending) {
    const [{ n }] = await db.select({ n: count() }).from(cases).where(and(eq(cases.bookingId, p.bookingId), inArray(cases.status, ["open", "in_progress"])));
    if (n && p.status === "scheduled") await db.update(payouts).set({ status: "held" }).where(eq(payouts.id, p.id));
    if (!n && p.status === "held") await db.update(payouts).set({ status: "scheduled" }).where(eq(payouts.id, p.id));
  }

  // 6. Reviews publish when both sides wrote, or 14 days after check-out.
  const unpublished = await db.query.reviews.findMany({ where: isNull(reviews.publishedAt), with: { booking: true } });
  const touched = new Set<string>();
  for (const r of unpublished) {
    const [{ n }] = await db.select({ n: count() }).from(reviews).where(eq(reviews.bookingId, r.bookingId));
    if (n >= 2 || r.booking.checkOut < addDays(today, -14)) {
      await db.update(reviews).set({ publishedAt: now }).where(and(eq(reviews.bookingId, r.bookingId), isNull(reviews.publishedAt)));
      touched.add(r.booking.listingId);
    }
  }
  for (const listingId of touched) {
    const [agg] = await db.select({ a: avg(reviews.rating), n: count() }).from(reviews).innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .where(and(eq(bookings.listingId, listingId), eq(reviews.role, "guest_to_host"), isNotNull(reviews.publishedAt)));
    await db.update(listings).set({ ratingAvg: agg.a ? Number(agg.a) : null, ratingCount: agg.n }).where(eq(listings.id, listingId));
  }

  // 7. iCal imports every 3 hours.
  const last = Number((await getSetting("lastIcalSync")) ?? 0);
  if (now.getTime() - last > 3 * H) {
    await setSetting("lastIcalSync", String(now.getTime()));
    const withUrl = await db.select({ id: listings.id }).from(listings).where(and(isNotNull(listings.icalImportUrl), inArray(listings.status, ["live", "paused"])));
    for (const l of withUrl) await importCalendar(l.id);
    log.push(`ical ${withUrl.length}`);
  }
  return log;
}

/** Runs the tick at most once a minute; called from busy pages so a small deployment works without cron. */
export async function tickIfDue() {
  const now = Date.now();
  const claimed = await db.execute(sql`
    INSERT INTO settings (key, value) VALUES ('lastTick', ${String(now)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE settings.value::bigint < ${now - 60_000}
    RETURNING key`);
  if (!claimed.rowCount) return;
  try { await runTick(); } catch (e) { console.error("tick failed", e); }
}
