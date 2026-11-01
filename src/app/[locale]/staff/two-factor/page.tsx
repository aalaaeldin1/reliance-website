import { redirect } from "next/navigation";
import { pageCtx, type LP } from "@/lib/page";
import { newTotpSecret, otpauthUrl } from "@/lib/totp";
import { TotpForm } from "@/components/AdminForms";

export const dynamic = "force-dynamic";

export default async function TwoFactor({ params }: LP) {
  const { l, t, cur } = await pageCtx(params);
  if (!cur || cur.user.staffRole === "none") redirect(`/${l}`);
  if (cur.user.totpSecret && cur.staff2fa) redirect(`/${l}/admin`);
  const secret = cur.user.totpSecret ? null : newTotpSecret();
  return (
    <div className="wrap max-w-md py-14">
      <h1 className="font-display text-4xl font-semibold">{t.admin.twoFactor}</h1>
      <p className="mb-6 mt-2 text-sm text-muted">{t.admin.twoFactorLead}</p>
      <div className="card space-y-4 p-6">
        {secret && (<>
          <p className="text-sm">{t.admin.setupLead}</p>
          <div><span className="label">{t.admin.key}</span><code className="block break-all rounded bg-mist px-3 py-2 font-mono text-sm" dir="ltr">{secret.match(/.{1,4}/g)?.join(" ")}</code></div>
          <details className="text-xs text-muted"><summary>otpauth URL</summary><code className="break-all" dir="ltr">{otpauthUrl(secret, cur.user.phone)}</code></details>
        </>)}
        <TotpForm locale={l} secret={secret ?? ""} t={t.admin} />
      </div>
    </div>
  );
}
