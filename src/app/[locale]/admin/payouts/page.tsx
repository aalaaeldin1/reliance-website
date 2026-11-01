import { desc, eq, inArray } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { hostProfiles, payouts } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { decryptFull } from "@/lib/safe";
import { payoutSentAction } from "@/app/actions/admin";
import { Empty, Notice, Pill, Stat, Table } from "@/components/ui";

export default async function Payouts({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const sp = await searchParams;
  const a = t.admin;
  const rows = await db.query.payouts.findMany({ where: inArray(payouts.status, ["scheduled", "held"]), with: { booking: { with: { listing: true } } }, orderBy: payouts.dueAt });
  const sent = await db.query.payouts.findMany({ where: eq(payouts.status, "sent"), with: { booking: true }, orderBy: desc(payouts.sentAt), limit: 30 });
  const hostIds = [...new Set(rows.map((r) => r.booking.listing.hostId))];
  const hosts = hostIds.length ? await db.select().from(hostProfiles).where(inArray(hostProfiles.userId, hostIds)) : [];
  const hostOf = (id: string) => hosts.find((h) => h.userId === id);
  const now = new Date();
  const due = rows.filter((r) => r.status === "scheduled" && r.dueAt <= now), upcoming = rows.filter((r) => r.status === "scheduled" && r.dueAt > now), held = rows.filter((r) => r.status === "held");
  const sum = (xs: typeof rows) => xs.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.payouts}</h1>
        <p className="text-sm text-muted">{l === "ar" ? "تُستحق بعد 24 ساعة من الوصول. البلاغ المفتوح يوقف التحويل." : "Due 24 hours after check-in. An open case holds the payout."}</p></div>
      {sp.error && <Notice tone="bad">{sp.error === "note" ? a.needNote : t.common.error}</Notice>}
      <div className="grid grid-cols-3 gap-3"><Stat k={a.dueNow} v={fmtEgp(sum(due), l)} s={`${due.length}`} alert={due.length > 0} /><Stat k={a.upcoming} v={fmtEgp(sum(upcoming), l)} s={`${upcoming.length}`} /><Stat k={a.held} v={fmtEgp(sum(held), l)} s={`${held.length}`} /></div>
      <h2 className="font-display text-2xl font-semibold">{a.dueNow}</h2>
      {!due.length ? <Empty title={t.common.noResults} /> : (
        <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th">{l === "ar" ? "المضيف" : "Host"}</th><th className="th">{t.host.payoutMethod}</th><th className="th text-end">{t.common.amount}</th><th className="th">{l === "ar" ? "مستحق" : "Due"}</th><th className="th">{a.markSent}</th></tr></thead>
          <tbody>{due.map((p) => { const h = hostOf(p.booking.listing.hostId); return (
            <tr key={p.id}><td className="td font-mono text-xs">{p.booking.reference}</td><td className="td">{h?.displayName}</td>
              <td className="td text-xs"><span className="font-mono" dir="ltr">{h ? `${h.payoutMethod}: ${decryptFull(h.payoutAccountEnc)}` : "—"}</span></td>
              <td className="td num text-end font-semibold">{fmtEgp(p.amount, l)}</td><td className="td text-xs">{fmtDateTime(p.dueAt, l)}</td>
              <td className="td"><form action={payoutSentAction} className="flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="payoutId" value={p.id} />
                <input name="transferReference" className="input w-36 py-1 text-xs" placeholder={a.transferRef} aria-label={a.transferRef} required /><button className="btn-ok btn-sm">{a.markSent}</button></form></td></tr>); })}</tbody></Table>)}
      {(upcoming.length > 0 || held.length > 0) && (<>
        <h2 className="font-display text-2xl font-semibold">{a.upcoming} · {a.held}</h2>
        <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th text-end">{t.common.amount}</th><th className="th">{l === "ar" ? "مستحق" : "Due"}</th><th className="th">{t.common.status}</th></tr></thead>
          <tbody>{[...held, ...upcoming].map((p) => <tr key={p.id}><td className="td font-mono text-xs">{p.booking.reference}</td><td className="td num text-end">{fmtEgp(p.amount, l)}</td><td className="td text-xs">{fmtDate(p.dueAt, l)}</td><td className="td"><Pill tone={p.status === "held" ? "bad" : "info"}>{t.host.payoutStatus[p.status]}</Pill></td></tr>)}</tbody></Table></>)}
      <h2 className="font-display text-2xl font-semibold">{a.sent}</h2>
      <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th text-end">{t.common.amount}</th><th className="th">{a.transferRef}</th><th className="th">{t.common.date}</th></tr></thead>
        <tbody>{sent.map((p) => <tr key={p.id}><td className="td font-mono text-xs">{p.booking.reference}</td><td className="td num text-end">{fmtEgp(p.amount, l)}</td><td className="td font-mono text-xs">{p.transferReference}</td><td className="td text-xs">{p.sentAt ? fmtDate(p.sentAt, l) : ""}</td></tr>)}</tbody></Table>
    </>
  );
}
