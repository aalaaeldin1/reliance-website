import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { fraudFlags, messages } from "@/db/schema";
import { fmtDateTime } from "@/lib/i18n";
import { resolveFlagAction } from "@/app/actions/admin";
import { Empty, Table } from "@/components/ui";

export default async function Flags({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const flags = await db.query.fraudFlags.findMany({ where: eq(fraudFlags.resolved, false), with: { listing: true }, orderBy: desc(fraudFlags.createdAt) });
  const msgs = await db.query.messages.findMany({ where: eq(messages.flagged, true), with: { booking: true, sender: true }, orderBy: desc(messages.createdAt), limit: 100 });
  const Resolve = ({ id, kind }: { id: string; kind: string }) => (
    <form action={resolveFlagAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="flagId" value={id} /><input type="hidden" name="kind" value={kind} /><button className="btn btn-sm">{t.admin.resolve}</button></form>);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.flags}</h1></div>
      <h2 className="font-display text-2xl font-semibold">{l === "ar" ? "البيوت" : "Listings"}</h2>
      {!flags.length ? <Empty title={t.admin.noFlags} /> : <Table><tbody>{flags.map((f) => <tr key={f.id}><td className="td text-xs">{f.kind}</td><td className="td">{f.listing && <Link className="link" href={`/${l}/admin/approvals?id=${f.listingId}`}>{f.listing.titleEn || f.listing.titleAr}</Link>}</td><td className="td text-sm">{f.detail}</td><td className="td"><Resolve id={f.id} kind="flag" /></td></tr>)}</tbody></Table>}
      <h2 className="font-display text-2xl font-semibold">{l === "ar" ? "رسائل تطلب الدفع خارج المنصة" : "Messages asking to pay outside Reliance"}</h2>
      {!msgs.length ? <Empty title={t.admin.noFlags} /> : <Table><tbody>{msgs.map((m) => <tr key={m.id}><td className="td font-mono text-xs">{m.booking.reference}</td><td className="td text-xs">{m.sender.name}</td><td className="td text-sm" dir="auto">{m.body}</td><td className="td text-xs">{fmtDateTime(m.createdAt, l)}</td><td className="td"><Resolve id={m.id} kind="message" /></td></tr>)}</tbody></Table>}
    </>
  );
}
