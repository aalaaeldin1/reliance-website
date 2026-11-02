import { requireStaff } from "@/lib/auth";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { payments } from "@/db/schema";
import { fmtDateTime, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { paymentDecisionAction } from "@/app/actions/admin";
import { Empty, Notice, Pill, Table } from "@/components/ui";
import { paymentsMode } from "@/lib/paymob";

export default async function Payments({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["finance"]); // the menu hides this page from other roles; this blocks a typed address too
  const sp = await searchParams;
  const a = t.admin;
  const queue = await db.query.payments.findMany({ where: eq(payments.status, "submitted"), with: { booking: { with: { guest: true, listing: true } } }, orderBy: payments.createdAt });
  const recent = await db.query.payments.findMany({ where: inArray(payments.status, ["confirmed", "rejected", "failed", "pending"]), with: { booking: true }, orderBy: desc(payments.createdAt), limit: 40 });
  const err = sp.error === "matched" ? (l === "ar" ? "أكّد المطابقة مع كشف الحساب أولًا." : "Tick “matched with statement” first.") : sp.error === "note" ? a.needNote : sp.error ? t.bookingErr[sp.error as keyof Dict["bookingErr"]] ?? t.common.error : null;
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.payments}</h1>
        <p className="text-sm text-muted">{l === "ar" ? "وضع الدفع" : "Payment mode"}: <b>{paymentsMode()}</b></p></div>
      {err && <Notice tone="bad">{err}</Notice>}
      {!queue.length ? <Empty title={t.common.noResults} /> : queue.map((p) => (
        <div key={p.id} className="card grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-1 text-sm">
            <div className="font-semibold">{p.booking.reference} · {p.booking.guest.name} <span className="text-muted" dir="ltr">{p.booking.guest.phone}</span></div>
            <div>{a.expected}: <b className="num">{fmtEgp(p.amount, l)}</b> · {p.method} · {t.trips.transferRef}: <span className="font-mono">{p.externalReference}</span></div>
            <div className="text-xs text-muted">{fmtDateTime(p.createdAt, l)} · {p.booking.listing.titleEn}</div>
            {p.proofFileKey && <a className="link text-sm" href={`/api/private/${p.proofFileKey}`} target="_blank" rel="noreferrer">{a.proof} ↗</a>}
          </div>
          <div className="space-y-2">
            <form action={paymentDecisionAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="paymentId" value={p.id} />
              <input name="statementRef" className="input w-40" placeholder={l === "ar" ? "مرجع الكشف" : "Statement ref"} aria-label="Statement reference" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="matched" /> {a.matched}</label>
              <button name="op" value="confirm" className="btn-ok btn-sm">{a.confirmPayment}</button></form>
            <form action={paymentDecisionAction} className="flex gap-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="paymentId" value={p.id} />
              <input name="reason" className="input w-56" placeholder={t.common.reason} aria-label={t.common.reason} />
              <button name="op" value="reject" className="btn-bad btn-sm">{a.rejectPayment}</button></form>
          </div>
        </div>))}
      <h2 className="font-display text-2xl font-semibold">{l === "ar" ? "أحدث المدفوعات" : "Recent payments"}</h2>
      <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th">{t.trips.method}</th><th className="th text-end">{t.common.amount}</th><th className="th">{t.common.status}</th><th className="th">{t.common.date}</th></tr></thead>
        <tbody>{recent.map((p) => <tr key={p.id}><td className="td font-mono text-xs"><Link className="link" href={`/${l}/admin/bookings?q=${p.booking.reference}`}>{p.booking.reference}</Link></td><td className="td">{p.method}</td><td className="td num text-end">{fmtEgp(p.amount, l)}</td>
          <td className="td"><Pill tone={p.status === "confirmed" ? "ok" : p.status === "pending" ? "warn" : "bad"}>{p.status}</Pill></td><td className="td text-xs">{fmtDateTime(p.confirmedAt ?? p.createdAt, l)}</td></tr>)}</tbody></Table>
    </>
  );
}
