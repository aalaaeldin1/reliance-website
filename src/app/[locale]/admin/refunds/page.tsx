import { requireStaff } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { refunds } from "@/db/schema";
import { fmtDate } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { refundOverrideAction, refundSentAction } from "@/app/actions/admin";
import { Empty, Notice, Pill, Table } from "@/components/ui";

export default async function Refunds({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["finance"]); // the menu hides this page from other roles; this blocks a typed address too
  const sp = await searchParams;
  const a = t.admin;
  const pending = await db.query.refunds.findMany({ where: eq(refunds.status, "pending"), with: { booking: { with: { guest: true, payments: true } } }, orderBy: refunds.createdAt });
  const done = await db.query.refunds.findMany({ where: eq(refunds.status, "sent"), with: { booking: true }, orderBy: desc(refunds.sentAt), limit: 30 });
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.refunds}</h1>
        <p className="text-sm text-muted">{l === "ar" ? "تُرد المبالغ بنفس طريقة الدفع خلال 7 أيام." : "Refund to the original payment method within 7 days."}</p></div>
      {sp.error && <Notice tone="bad">{sp.error === "limit" ? (l === "ar" ? "التعديلات فوق 10,000 ج.م تحتاج مديرًا عامًا." : "Overrides above E£10,000 need a super admin.") : sp.error === "note" ? a.needNote : t.common.error}</Notice>}
      {!pending.length ? <Empty title={t.common.noResults} /> : (
        <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th">{t.common.guest}</th><th className="th">{t.common.reason}</th><th className="th text-end">{t.common.amount}</th><th className="th">{t.trips.method}</th><th className="th" /></tr></thead>
          <tbody>{pending.map((r) => (
            <tr key={r.id}><td className="td font-mono text-xs">{r.booking.reference}</td><td className="td">{r.booking.guest.name} <span className="text-xs text-muted" dir="ltr">{r.booking.guest.phone}</span></td>
              <td className="td text-xs">{r.reason}{r.override && <Pill tone="warn">override</Pill>}</td><td className="td num text-end font-semibold">{fmtEgp(r.amount, l)}</td>
              <td className="td text-xs">{r.booking.payments.find((p) => p.status === "confirmed")?.method ?? "—"}</td>
              <td className="td"><form action={refundSentAction} className="flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="refundId" value={r.id} />
                <input name="transferReference" className="input w-36 py-1 text-xs" placeholder={a.transferRef} aria-label={a.transferRef} required /><button className="btn-ok btn-sm">{a.markSent}</button></form></td></tr>))}</tbody></Table>)}
      <form action={refundOverrideAction} className="card grid gap-3 p-4 sm:grid-cols-[1fr_8rem_1.5fr_auto] sm:items-end">
        <input type="hidden" name="locale" value={l} />
        <div><label className="label" htmlFor="ro-b">{l === "ar" ? "معرّف الحجز" : "Booking ID"}</label><input id="ro-b" name="bookingId" className="input font-mono text-xs" required /></div>
        <div><label className="label" htmlFor="ro-a">{a.override} (E£)</label><input id="ro-a" name="amount" type="number" min={1} className="input" required /></div>
        <div><label className="label" htmlFor="ro-r">{a.overrideReason}</label><input id="ro-r" name="reason" className="input" required /></div>
        <button className="btn-navy">{t.common.save}</button>
      </form>
      <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th text-end">{t.common.amount}</th><th className="th">{a.transferRef}</th><th className="th">{t.common.date}</th></tr></thead>
        <tbody>{done.map((r) => <tr key={r.id}><td className="td font-mono text-xs">{r.booking.reference}</td><td className="td num text-end">{fmtEgp(r.amount, l)}</td><td className="td font-mono text-xs">{r.transferReference}</td><td className="td text-xs">{r.sentAt ? fmtDate(r.sentAt, l) : ""}</td></tr>)}</tbody></Table>
    </>
  );
}
