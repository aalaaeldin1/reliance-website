import { pageCtx, type LP } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { IdUploadForm, ProfileForm } from "@/components/TripForms";
import { Notice, PageHead, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Account({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const cur = await requireUser(l, `/${l}/account`);
  const u = cur.user;
  const a = t.account;
  const tone = u.idStatus === "verified" ? "ok" : u.idStatus === "pending" ? "info" : u.idStatus === "rejected" ? "bad" : "warn";
  return (
    <div className="wrap max-w-3xl space-y-8 pb-10">
      <PageHead title={a.title} />
      <section className="card space-y-4 p-6"><h2 className="font-display text-2xl font-semibold">{a.profile}</h2>
        <p className="text-sm text-muted" dir="ltr">{u.phone}</p>
        <ProfileForm locale={l} user={u} t={{ ...a, save: t.common.save, saved: t.common.saved }} /></section>
      <section className="card space-y-4 p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold">{a.id}</h2><Pill tone={tone}>{a.idStatus[u.idStatus]}</Pill></div>
        <p className="text-sm text-muted">{a.idLead}</p>
        {u.idStatus === "rejected" && <Notice tone="bad">{fill(a.idRejected, { reason: u.idReason ?? "" })}</Notice>}
        {u.idStatus !== "verified" && <IdUploadForm locale={l} t={a} />}
      </section>
    </div>
  );
}
