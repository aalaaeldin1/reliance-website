import { desc, ilike, ne, or } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { fmtDate } from "@/lib/i18n";
import { userAdminAction } from "@/app/actions/admin";
import { Pill, Table } from "@/components/ui";

export default async function Users({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["super_admin"]);
  const sp = await searchParams;
  const a = t.admin;
  const q = sp.q?.trim();
  const rows = await db.select().from(users).where(q ? or(ilike(users.phone, `%${q}%`), ilike(users.name, `%${q}%`)) : ne(users.staffRole, "none")).orderBy(desc(users.createdAt)).limit(100);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.users}</h1></div>
      <form className="flex gap-2"><input name="q" defaultValue={q} className="input w-72" placeholder={a.searchUsers} aria-label={a.searchUsers} /><button className="btn btn-sm">{t.common.search}</button></form>
      {!q && <p className="text-sm text-muted">{l === "ar" ? "يظهر فريق العمل. ابحث لإيجاد أي مستخدم." : "Showing staff. Search to find any user."}</p>}
      <Table><thead><tr><th className="th">{t.account.name}</th><th className="th">{t.auth.phone}</th><th className="th">ID</th><th className="th">{a.role}</th><th className="th">{t.common.date}</th><th className="th" /></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}>
            <td className="td">{u.name}{u.suspendedAt && <Pill tone="bad">{a.suspend}</Pill>}</td><td className="td font-mono text-xs" dir="ltr">{u.phone}</td>
            <td className="td"><Pill tone={u.idStatus === "verified" ? "ok" : "mute"}>{t.account.idStatus[u.idStatus]}</Pill></td>
            <td className="td"><form action={userAdminAction} className="flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="op" value="role" />
              <select name="role" defaultValue={u.staffRole} className="input w-36 py-1 text-xs" aria-label={a.role}>{Object.entries(a.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn btn-sm">{a.setRole}</button></form></td>
            <td className="td text-xs">{fmtDate(u.createdAt, l)}</td>
            <td className="td"><div className="flex gap-1">
              <form action={userAdminAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="userId" value={u.id} />
                {u.suspendedAt ? <button name="op" value="restore" className="btn btn-sm">{a.restore}</button> : <button name="op" value="suspend" className="btn-bad btn-sm">{a.suspend}</button>}</form>
              {u.totpSecret && <form action={userAdminAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="userId" value={u.id} /><button name="op" value="reset2fa" className="btn btn-sm">2FA ↺</button></form>}
            </div></td>
          </tr>))}</tbody></Table>
    </>
  );
}
