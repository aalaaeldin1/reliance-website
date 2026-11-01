import { desc, eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/db/schema";
import { fmtDateTime } from "@/lib/i18n";
import { Table } from "@/components/ui";

export default async function Audit({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["super_admin"]);
  const sp = await searchParams;
  const rows = await db.select({ a: auditLogs, name: users.name }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(sp.entity ? eq(auditLogs.entityId, sp.entity) : undefined).orderBy(desc(auditLogs.createdAt)).limit(300);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.audit}</h1></div>
      <Table><thead><tr><th className="th">{t.common.date}</th><th className="th">{l === "ar" ? "من" : "Who"}</th><th className="th">{t.common.actions}</th><th className="th">{l === "ar" ? "على" : "On"}</th><th className="th">{l === "ar" ? "التفاصيل" : "Details"}</th></tr></thead>
        <tbody>{rows.map(({ a, name }) => <tr key={a.id}><td className="td whitespace-nowrap text-xs">{fmtDateTime(a.createdAt, l)}</td><td className="td text-xs">{name ?? "system"}</td><td className="td font-mono text-xs">{a.action}</td>
          <td className="td text-xs"><a className="link" href={`?entity=${a.entityId}`}>{a.entity}</a></td><td className="td max-w-md truncate font-mono text-[11px] text-muted" title={JSON.stringify(a.after)}>{a.after ? JSON.stringify(a.after) : ""}</td></tr>)}</tbody></Table>
    </>
  );
}
