import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { bookings, bookingStatus } from "@/db/schema";
import { fmtDate } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { listingTitle } from "@/lib/listings";
import { adminCancelAction } from "@/app/actions/admin";
import { BOOKING_TONE, Notice, Pill, Table } from "@/components/ui";

export default async function AdminBookings({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const sp = await searchParams;
  const status = bookingStatus.enumValues.find((s) => s === sp.status);
  const conds: (SQL | undefined)[] = [status ? eq(bookings.status, status) : undefined, sp.q ? ilike(bookings.reference, `%${sp.q.trim()}%`) : undefined];
  const rows = await db.query.bookings.findMany({ where: and(...conds), with: { listing: true, guest: true, payments: true }, orderBy: desc(bookings.createdAt), limit: 200 });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.bookings}</h1></div>
        <a className="btn btn-sm" href={`/api/admin/export/bookings`}>{t.admin.exportCsv}</a></div>
      {sp.error && <Notice tone="bad">{t.bookingErr.state}</Notice>}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} className="input w-48 font-mono" placeholder="RS-…" aria-label={t.common.reference} />
        <select name="status" defaultValue={status ?? ""} className="input w-auto" aria-label={t.common.status}><option value="">{t.common.all}</option>{bookingStatus.enumValues.map((s) => <option key={s} value={s}>{t.trips.status[s]}</option>)}</select>
        <button className="btn btn-sm">{t.common.filter}</button>
      </form>
      <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th">{l === "ar" ? "البيت" : "Home"}</th><th className="th">{t.common.guest}</th><th className="th">{t.common.date}</th><th className="th text-end">{t.common.total}</th><th className="th">{t.trips.method}</th><th className="th">{t.common.status}</th><th className="th" /></tr></thead>
        <tbody>{rows.map((b) => (
          <tr key={b.id}>
            <td className="td font-mono text-xs" title={b.id}>{b.reference}</td><td className="td">{listingTitle(b.listing, l)}</td><td className="td">{b.guest.name}</td>
            <td className="td num whitespace-nowrap text-xs">{fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)}</td><td className="td num text-end">{fmtEgp(b.total, l)}</td>
            <td className="td text-xs">{b.payments.find((p) => p.status === "confirmed")?.method ?? "—"}</td>
            <td className="td"><Pill tone={BOOKING_TONE[b.status]}>{t.trips.status[b.status]}</Pill></td>
            <td className="td">{["requested", "awaiting_payment", "payment_review", "confirmed", "in_stay"].includes(b.status) && (
              <details><summary className="cursor-pointer text-xs text-bad">{t.common.cancel}</summary>
                <form action={adminCancelAction} className="mt-1 flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="ref" value={b.reference} />
                  <input name="reason" className="input w-32 py-1 text-xs" placeholder={t.common.reason} aria-label={t.common.reason} required /><button className="btn-bad btn-sm">{t.trips.confirmCancel}</button></form></details>)}</td>
          </tr>))}</tbody></Table>
    </>
  );
}
