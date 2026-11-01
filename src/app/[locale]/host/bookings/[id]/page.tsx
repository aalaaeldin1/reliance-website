import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, messages, reviews } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { fill, fmtDate, fmtDateTime, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { hostPayoutOf } from "@/lib/bookings";
import { hostBookingAction } from "@/app/actions/host";
import { reviewAction } from "@/app/actions/guest";
import { Thread } from "@/components/Thread";
import { PrintButton } from "@/components/PrintButton";
import { BOOKING_TONE, Notice, Pill } from "@/components/ui";
import { HOST_FEE_BPS, pctLabel } from "@/lib/fees";

export const dynamic = "force-dynamic";

export default async function HostBooking({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const { id } = await params;
  const sp = await searchParams;
  const cur = await requireUser(l);
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, id), with: { listing: { with: { area: true } }, guest: true, payout: true } });
  if (!b || b.listing.hostId !== cur.user.id) notFound();
  const [thread, mine] = await Promise.all([
    db.select().from(messages).where(eq(messages.bookingId, id)).orderBy(asc(messages.createdAt)),
    db.query.reviews.findFirst({ where: and(eq(reviews.bookingId, id), eq(reviews.authorId, cur.user.id)) }),
  ]);
  const h = t.host;
  const confirmed = ["confirmed", "in_stay", "completed"].includes(b.status);
  const back = `/${l}/host/bookings/${id}`;
  return (
    <div className="wrap max-w-5xl py-8">
      <Link href={`/${l}/host`} className="no-print text-sm text-muted">← {h.dashboard}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><div className="eyebrow">{b.reference}</div><h1 className="font-display text-4xl font-semibold">{listingTitle(b.listing, l)}</h1>
          <p className="num mt-1 text-muted">{fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)} · {b.nights} {t.common.nights} · {b.guests} {t.common.guests}</p></div>
        <Pill tone={BOOKING_TONE[b.status]}>{t.trips.status[b.status]}</Pill>
      </div>
      {sp.error && <div className="mt-4"><Notice tone="bad">{t.bookingErr[sp.error as keyof Dict["bookingErr"]] ?? t.common.error}</Notice></div>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-8">
          <section className="card space-y-3 p-5 no-print">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">{t.common.guest}</dt><dd>{b.guest.name} · <Pill tone={b.guest.idStatus === "verified" ? "ok" : "warn"}>{t.account.idStatus[b.guest.idStatus]}</Pill></dd>
              {b.message && <><dt className="text-muted">{t.listing.message}</dt><dd className="whitespace-pre-line">{b.message}</dd></>}
              {b.expiresAt && b.status === "requested" && <><dt className="text-muted">{l === "ar" ? "ينتهي" : "Expires"}</dt><dd>{fmtDateTime(b.expiresAt, l)}</dd></>}
            </dl>
            {b.status === "requested" && (
              <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
                <form action={hostBookingAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} /><button name="op" value="accept" className="btn-ok">{h.accept}</button></form>
                <form action={hostBookingAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} />
                  <input name="reason" className="input w-64" placeholder={h.declineReason} aria-label={h.declineReason} required />
                  <button name="op" value="decline" className="btn-bad">{h.decline}</button></form>
              </div>)}
          </section>

          {confirmed && (
            <section className="card space-y-3 p-5">
              <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold">{h.registration}</h2><PrintButton label={h.print} /></div>
              <p className="text-sm text-muted">{h.registrationLead}</p>
              <table className="w-full text-sm"><thead><tr><th className="th">{t.trips.adultName}</th><th className="th">{t.trips.adultId}</th><th className="th">{t.trips.adultNat}</th></tr></thead>
                <tbody>{(b.adultGuests ?? []).map((a, i) => <tr key={i}><td className="td">{a.name}</td><td className="td font-mono">{a.idNumber}</td><td className="td">{a.nationality}</td></tr>)}</tbody></table>
              <p className="text-xs text-muted">{b.listing.address} · {fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)} · {b.reference}</p>
            </section>)}

          <div className="no-print"><Thread l={l} t={t} bookingId={b.id} me={cur.user.id} back={back} items={thread} /></div>

          {b.status === "completed" && !mine && (
            <form action={reviewAction} className="card no-print space-y-3 p-5">
              <h2 className="font-display text-2xl font-semibold">{l === "ar" ? "قيّم الضيف" : "Review your guest"}</h2>
              <input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="back" value={back} />
              <select name="rating" className="input w-32" defaultValue="5" aria-label={t.trips.rating}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select>
              <textarea name="comment" className="input min-h-20" required aria-label={t.trips.comment} />
              <button className="btn-gold">{t.trips.postReview}</button>
            </form>)}
        </div>
        <aside className="no-print space-y-4">
          <div className="card space-y-1.5 p-5 text-sm">
            <div className="flex justify-between"><span>{b.nights} {t.common.nights}</span><span className="num">{fmtEgp(b.baseAmount, l)}</span></div>
            {b.cleaningFee > 0 && <div className="flex justify-between"><span>{t.listing.cleaning}</span><span className="num">{fmtEgp(b.cleaningFee, l)}</span></div>}
            <div className="flex justify-between text-muted"><span>{l === "ar" ? "رسوم المضيف" : "Host fee"} ({pctLabel(HOST_FEE_BPS)})</span><span className="num">−{fmtEgp(b.hostFee, l)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><span>{h.payout}</span><span className="num">{fmtEgp(hostPayoutOf(b), l)}</span></div>
            {b.payout && <div className="text-xs text-muted">{h.payoutStatus[b.payout.status]} · {b.payout.status === "sent" ? b.payout.transferReference : fill(h.due, { date: fmtDate(b.payout.dueAt, l) })}</div>}
          </div>
          {["awaiting_payment", "payment_review", "confirmed"].includes(b.status) && (
            <details className="card p-5"><summary className="cursor-pointer text-sm font-semibold text-bad">{t.trips.cancel}</summary>
              <p className="mt-2 text-xs text-muted">{l === "ar" ? "إلغاء المضيف يعني استرداد الضيف لكامل المبلغ وقد يؤثر على حسابك." : "If you cancel, the guest gets a full refund and your account may be reviewed."}</p>
              <form action={hostBookingAction} className="mt-3 space-y-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} />
                <input name="reason" className="input" required placeholder={t.common.reason} aria-label={t.common.reason} />
                <button name="op" value="cancel" className="btn-bad">{t.trips.confirmCancel}</button></form>
            </details>)}
        </aside>
      </div>
    </div>
  );
}
