import { requireStaff } from "@/lib/auth";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { hostProfiles, kycDocuments, users } from "@/db/schema";
import { fmtDate, fmtDateTime, type Dict } from "@/lib/i18n";
import { docDecisionAction, guestIdAction, hostKycAction } from "@/app/actions/admin";
import { Empty, Notice, Pill } from "@/components/ui";

export default async function Kyc({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["verifier"]); // the menu hides this page from other roles; this blocks a typed address too
  const sp = await searchParams;
  const a = t.admin;
  const hosts = await db.select().from(hostProfiles).innerJoin(users, eq(users.id, hostProfiles.userId)).where(inArray(hostProfiles.kycStatus, ["pending", "rejected"])).orderBy(desc(hostProfiles.createdAt));
  const guests = await db.select().from(users).where(eq(users.idStatus, "pending")).orderBy(desc(users.createdAt));
  const ids = [...hosts.map((h) => h.users.id), ...guests.map((g) => g.id)];
  const docs = ids.length ? await db.select().from(kycDocuments).where(inArray(kycDocuments.userId, ids)).orderBy(desc(kycDocuments.createdAt)) : [];
  const docList = (userId: string, guestOnly = false) => docs.filter((d) => d.userId === userId && (!guestOnly || ["national_id_front", "national_id_back", "passport"].includes(d.docType)));
  const Doc = ({ d }: { d: (typeof docs)[number] }) => (
    <li className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-sm first:border-0">
      <a className="link" href={`/api/private/${d.fileKey}`} target="_blank" rel="noreferrer">{t.host.docTypes[d.docType as keyof Dict["host"]["docTypes"]] ?? d.docType}</a>
      <Pill tone={d.status === "approved" ? "ok" : d.status === "rejected" ? "bad" : "warn"}>{t.host.docStatus[d.status]}</Pill>
      <span className="text-xs text-muted">{fmtDate(d.createdAt, l)}</span>
      {d.status === "pending" && (
        <form action={docDecisionAction} className="ms-auto flex gap-1"><input type="hidden" name="locale" value={l} /><input type="hidden" name="docId" value={d.id} /><input type="hidden" name="back" value={`/${l}/admin/kyc`} />
          <input name="reason" className="input w-40 py-1 text-xs" placeholder={t.common.reason} aria-label={t.common.reason} />
          <button name="op" value="approve" className="btn-ok btn-sm">{a.approveDoc}</button><button name="op" value="reject" className="btn-bad btn-sm">{a.rejectDoc}</button></form>)}
    </li>);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.kyc}</h1></div>
      {sp.error === "note" && <Notice tone="bad">{a.needNote}</Notice>}
      <p className="text-xs text-muted">{l === "ar" ? "كل فتح لملف مسجل في سجل التدقيق." : "Every file you open is recorded in the audit log."}</p>
      <section className="space-y-3"><h2 className="font-display text-2xl font-semibold">{a.hostChecks}</h2>
        {!hosts.length ? <Empty title={t.common.noResults} /> : hosts.map(({ host_profiles: h, users: u }) => (
          <div key={u.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{h.displayName}</b> <span className="text-sm text-muted">· {u.name} · <span dir="ltr">{u.phone}</span> · {t.host[h.hostType]}</span></div>
              <Pill tone={h.kycStatus === "rejected" ? "bad" : "warn"}>{t.host.kyc[h.kycStatus]}</Pill></div>
            <p className="text-xs text-muted">{t.host.videoCall}: {h.videoCallAt ? fmtDateTime(h.videoCallAt, l) : "—"}</p>
            <ul>{docList(u.id).map((d) => <Doc key={d.id} d={d} />)}</ul>
            <form action={hostKycAction} className="flex flex-wrap gap-2 border-t border-line pt-3"><input type="hidden" name="locale" value={l} /><input type="hidden" name="userId" value={u.id} />
              <input name="reason" className="input max-w-xs" placeholder={t.common.reason} aria-label={t.common.reason} />
              <button name="op" value="verify" className="btn-ok">{a.verifyHost}</button><button name="op" value="reject" className="btn-bad">{a.rejectHost}</button></form>
          </div>))}
      </section>
      <section className="space-y-3"><h2 className="font-display text-2xl font-semibold">{a.guestIds}</h2>
        {!guests.length ? <Empty title={t.common.noResults} /> : guests.map((u) => (
          <div key={u.id} className="card space-y-2 p-4">
            <div><b>{u.name}</b> <span className="text-sm text-muted" dir="ltr">{u.phone}</span></div>
            <ul>{docList(u.id, true).map((d) => <Doc key={d.id} d={d} />)}</ul>
            <form action={guestIdAction} className="flex flex-wrap gap-2 border-t border-line pt-3"><input type="hidden" name="locale" value={l} /><input type="hidden" name="userId" value={u.id} />
              <input name="reason" className="input max-w-xs" placeholder={t.common.reason} aria-label={t.common.reason} />
              <button name="op" value="verify" className="btn-ok">{t.common.verified}</button><button name="op" value="reject" className="btn-bad">{a.reject}</button></form>
          </div>))}
      </section>
    </>
  );
}
