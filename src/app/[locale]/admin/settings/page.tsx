import { count, eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, listings } from "@/db/schema";
import { GUEST_FEE_BPS, HOST_FEE_BPS, pctLabel } from "@/lib/fees";
import { paymentsMode } from "@/lib/paymob";
import { removeSampleDataAction } from "@/app/actions/admin";
import { Fragment } from "react";

export default async function Settings({ params }: LP) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["super_admin"]);
  const a = t.admin;
  const [[sl], [sb]] = await Promise.all([db.select({ n: count() }).from(listings).where(eq(listings.sample, true)), db.select({ n: count() }).from(bookings).where(eq(bookings.sample, true))]);
  const rows: [string, string][] = [
    [l === "ar" ? "رسوم الضيف" : "Guest fee", pctLabel(GUEST_FEE_BPS)], [l === "ar" ? "رسوم المضيف" : "Host fee", pctLabel(HOST_FEE_BPS)],
    [l === "ar" ? "وضع الدفع" : "Payments mode", paymentsMode()], ["InstaPay", process.env.PAY_INSTAPAY_ADDRESS ?? "—"], ["IBAN", process.env.PAY_BANK_IBAN ?? "—"],
    ["SMS", process.env.SMS_PROVIDER ?? "console"], ["Email", process.env.EMAIL_PROVIDER ?? "console"], ["Paymob", process.env.PAYMOB_SECRET_KEY ? "configured" : "not configured"],
  ];
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.settings}</h1><p className="text-sm text-muted">{a.settingsLead}</p></div>
      <dl className="card grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 p-5 text-sm">{rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="font-mono" dir="ltr">{v}</dd></Fragment>)}</dl>
      <section className="card space-y-3 p-5"><h2 className="font-display text-2xl font-semibold">{a.nav.exports}</h2>
        <div className="flex flex-wrap gap-2">{["bookings", "payments", "payouts", "refunds", "searches"].map((k) => <a key={k} className="btn btn-sm" href={`/api/admin/export/${k}`}>{k}.csv</a>)}</div></section>
      <section className="card space-y-3 p-5"><h2 className="font-display text-2xl font-semibold">{a.sampleData}</h2>
        <p className="text-sm text-muted">{a.sampleLead} ({sl.n} {l === "ar" ? "بيت" : "homes"}, {sb.n} {l === "ar" ? "حجز" : "bookings"})</p>
        {sl.n + sb.n > 0 && <details><summary className="btn-bad inline-flex cursor-pointer">{a.removeSample}</summary>
          <form action={removeSampleDataAction} className="mt-3"><input type="hidden" name="locale" value={l} /><input type="hidden" name="confirm" value="yes" /><button className="btn-bad">{a.confirmRemove}</button></form></details>}
      </section>
    </>
  );
}
