import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { bookings, listings, listingStatus } from "@/db/schema";
import { areaName, fmtDate } from "@/lib/i18n";
import { fmtEgp, fmtCompact } from "@/lib/money";
import { listingTitle } from "@/lib/listings";
import { suspendListingAction } from "@/app/actions/admin";
import { LISTING_TONE, Pill, Table } from "@/components/ui";

export default async function AdminListings({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t, cur } = await pageCtx(params);
  const sp = await searchParams;
  const status = listingStatus.enumValues.find((s) => s === sp.status);
  const conds: (SQL | undefined)[] = [status ? eq(listings.status, status) : undefined];
  if (sp.q) conds.push(or(ilike(listings.titleEn, `%${sp.q}%`), ilike(listings.titleAr, `%${sp.q}%`), ilike(listings.address, `%${sp.q}%`)));
  const rows = await db.query.listings.findMany({ where: and(...conds), with: { area: true, rate: true, host: true }, orderBy: desc(listings.createdAt), limit: 200 });
  const ids = rows.map((r) => r.id);
  const bks = ids.length ? await db.select({ listingId: bookings.listingId, total: bookings.total, status: bookings.status }).from(bookings).where(and(inArray(bookings.listingId, ids), inArray(bookings.status, ["confirmed", "in_stay", "completed"]))) : [];
  const canAct = cur?.user.staffRole !== "finance";
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.listings}</h1></div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} className="input w-64" placeholder={t.common.search} aria-label={t.common.search} />
        <select name="status" defaultValue={status ?? ""} className="input w-auto" aria-label={t.common.status}><option value="">{t.common.all}</option>{listingStatus.enumValues.map((s) => <option key={s} value={s}>{t.host.listingStatus[s]}</option>)}</select>
        <button className="btn btn-sm">{t.common.filter}</button>
      </form>
      <Table><thead><tr><th className="th">{l === "ar" ? "البيت" : "Home"}</th><th className="th">{t.common.area}</th><th className="th">{l === "ar" ? "المضيف" : "Host"}</th><th className="th text-end">{t.common.price}</th><th className="th text-end">{l === "ar" ? "إقامات" : "Stays"}</th><th className="th text-end">GBV</th><th className="th">{t.common.status}</th><th className="th">{l === "ar" ? "آخر مراجعة" : "Last check"}</th><th className="th" /></tr></thead>
        <tbody>{rows.map((x) => { const b = bks.filter((y) => y.listingId === x.id); return (
          <tr key={x.id}>
            <td className="td"><Link className="font-semibold hover:underline" href={`/${l}/listings/${x.id}`}>{listingTitle(x, l)}</Link>{x.sample && <span className="ms-1 text-[10px] uppercase text-muted">{t.common.sample}</span>}</td>
            <td className="td">{areaName(x.area, l)}</td><td className="td">{x.host.name}</td>
            <td className="td num text-end">{x.rate ? fmtEgp(x.rate.nightly, l) : "—"}</td><td className="td num text-end">{b.length}</td><td className="td num text-end">{fmtCompact(b.reduce((s, y) => s + y.total, 0), l)}</td>
            <td className="td"><Pill tone={LISTING_TONE[x.status]}>{t.host.listingStatus[x.status]}</Pill></td>
            <td className="td text-xs">{x.lastVerifiedAt ? fmtDate(x.lastVerifiedAt, l) : "—"}</td>
            <td className="td">{canAct && ["live", "paused", "suspended"].includes(x.status) && (
              <form action={suspendListingAction} className="flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={x.id} /><input type="hidden" name="back" value={`/${l}/admin/listings?status=${sp.status ?? ""}`} />
                {x.status === "suspended" ? <button name="op" value="restore" className="btn btn-sm">{t.admin.restore}</button>
                  : <><input name="note" className="input w-32 py-1 text-xs" placeholder={t.common.reason} aria-label={t.common.reason} required /><button name="op" value="suspend" className="btn-bad btn-sm">{t.admin.suspend}</button></>}
              </form>)}</td>
          </tr>); })}</tbody></Table>
    </>
  );
}
