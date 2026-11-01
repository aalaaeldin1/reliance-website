import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, payments, payouts, refunds, searchEvents } from "@/db/schema";
import { getCurrent, canDo } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dayStr } from "@/lib/dates";

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};
const egp = (p: number) => (p / 100).toFixed(2);

// CSV exports for the accountant (until Odoo is connected). Amounts in EGP.
export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const cur = await getCurrent();
  if (!cur || !cur.staff2fa || !canDo(cur.user.staffRole, ["finance"])) return new Response("Forbidden", { status: 403 });
  let rows: Record<string, unknown>[] = [];
  if (kind === "bookings") rows = (await db.query.bookings.findMany({ with: { listing: true }, orderBy: desc(bookings.createdAt) })).map((b) => ({
    reference: b.reference, status: b.status, listing: b.listing.titleEn || b.listing.titleAr, area: b.listing.areaId, check_in: dayStr(b.checkIn), check_out: dayStr(b.checkOut), nights: b.nights,
    stay_egp: egp(b.baseAmount), cleaning_egp: egp(b.cleaningFee), guest_fee_egp: egp(b.guestFee), host_fee_egp: egp(b.hostFee), total_egp: egp(b.total), created_at: b.createdAt, sample: b.sample,
  }));
  else if (kind === "payments") rows = (await db.query.payments.findMany({ with: { booking: true }, orderBy: desc(payments.createdAt) })).map((p) => ({ reference: p.booking.reference, method: p.method, status: p.status, amount_egp: egp(p.amount), external_ref: p.externalReference, paymob_txn: p.paymobTxnId, confirmed_at: p.confirmedAt }));
  else if (kind === "payouts") rows = (await db.query.payouts.findMany({ with: { booking: true }, orderBy: desc(payouts.dueAt) })).map((p) => ({ reference: p.booking.reference, status: p.status, amount_egp: egp(p.amount), method: p.method, due_at: p.dueAt, sent_at: p.sentAt, transfer_ref: p.transferReference }));
  else if (kind === "refunds") rows = (await db.query.refunds.findMany({ with: { booking: true }, orderBy: desc(refunds.createdAt) })).map((r) => ({ reference: r.booking.reference, status: r.status, amount_egp: egp(r.amount), reason: r.reason, sent_at: r.sentAt, transfer_ref: r.transferReference }));
  else if (kind === "searches") rows = (await db.select().from(searchEvents).orderBy(desc(searchEvents.createdAt)).limit(50_000)).map((s) => ({ area: s.areaId ?? "", nights: s.nights, guests: s.guests, budget_egp: egp(s.budget), results: s.resultsCount, at: s.createdAt }));
  else return new Response("Not found", { status: 404 });
  await audit(cur.user.id, "export.csv", "Export", kind, undefined, { rows: rows.length });
  return new Response("﻿" + csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reliance-${kind}-${dayStr(new Date())}.csv"` } });
}
