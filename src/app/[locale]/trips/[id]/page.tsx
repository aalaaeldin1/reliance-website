import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, hostProfiles, messages, reviews, users } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { areaName, fill, fmtDate, fmtDateTime, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { previewCancel } from "@/lib/bookings";
import { paymentsMode } from "@/lib/paymob";
import { GUEST_FEE_BPS, pctLabel } from "@/lib/fees";
import { tickIfDue } from "@/lib/jobs";
import { cancelAsGuestAction, payOnlineAction, reportAction, reviewAction } from "@/app/actions/guest";
import { AdultsForm, ManualPayForm } from "@/components/TripForms";
import { Thread } from "@/components/Thread";
import { BOOKING_TONE, Notice, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function Trip({ params, searchParams }: P) {
  const { l, t } = await pageCtx(params);
  const { id } = await params;
  const sp = await searchParams;
  const cur = await requireUser(l, `/${l}/trips/${id}`);
  await tickIfDue();
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, id), with: { listing: { with: { area: true } }, payments: true, refunds: true } });
  if (!b || b.guestId !== cur.user.id) notFound();
  const [host, hostUser, thread, myReview] = await Promise.all([
    db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, b.listing.hostId) }),
    db.query.users.findFirst({ where: eq(users.id, b.listing.hostId) }),
    db.select().from(messages).where(eq(messages.bookingId, id)).orderBy(asc(messages.createdAt)),
    db.query.reviews.findFirst({ where: and(eq(reviews.bookingId, id), eq(reviews.authorId, cur.user.id)) }),
  ]);
  const confirmed = ["confirmed", "in_stay", "completed"].includes(b.status);
  const cancellable = ["requested", "awaiting_payment", "payment_review", "confirmed", "in_stay"].includes(b.status);
  const preview = cancellable ? await previewCancel(b.id, "guest") : null;
  const mode = paymentsMode();
  const tr = t.trips;
  const err = sp.error ? t.bookingErr[sp.error as keyof Dict["bookingErr"]] ?? t.common.error : null;
  const idOk = cur.user.idStatus === "verified" || cur.user.idStatus === "pending";
  const back = `/${l}/trips/${id}`;

  return (
    <div className="wrap max-w-5xl py-8">
      <Link href={`/${l}/trips`} className="text-sm text-muted">← {tr.title}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><div className="eyebrow">{areaName(b.listing.area, l)} · {b.reference}</div>
          <h1 className="font-display text-4xl font-semibold"><Link href={`/${l}/listings/${b.listingId}`}>{listingTitle(b.listing, l)}</Link></h1>
          <p className="num mt-1 text-muted">{fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)} · {b.nights} {t.common.nights} · {b.guests} {t.common.guests}</p></div>
        <Pill tone={BOOKING_TONE[b.status]}>{tr.status[b.status]}</Pill>
      </div>
      {err && <div className="mt-4"><Notice tone="bad">{err}</Notice></div>}
      {sp.reported && <div className="mt-4"><Notice tone="ok">{tr.caseOpen}</Notice></div>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-8">
          {b.status === "requested" && <Notice>{t.listing.notCharged}</Notice>}

          {b.status === "awaiting_payment" && (
            <section className="card space-y-5 border-gold-500/60 p-5">
              <div><h2 className="font-display text-2xl font-semibold">{tr.payTitle}</h2>
                {b.expiresAt && <p className="text-sm text-warn">{fill(tr.payBy, { time: fmtDateTime(b.expiresAt, l) })}</p>}</div>
              {!idOk && <Notice tone="warn">{tr.idNeeded} <Link className="link" href={`/${l}/account`}>{t.nav.account} →</Link></Notice>}
              <div><h3 className="font-semibold">1. {tr.adults}</h3><p className="mb-2 text-xs text-muted">{tr.adultsLead}</p>
                <AdultsForm locale={l} bookingId={b.id} initial={b.adultGuests ?? []} t={tr} err={t.bookingErr} /></div>
              <div className="space-y-3"><h3 className="font-semibold">2. {mode === "manual" ? tr.payManual : tr.payOnline}</h3>
                {mode !== "manual" && (<>
                  <p className="text-sm text-muted">{tr.payOnlineLead}</p>
                  <form action={payOnlineAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} />
                    <button className="btn-gold" disabled={!idOk || !b.adultGuests?.length}>{mode === "simulate" ? tr.simulate : `${tr.payOnline} · ${fmtEgp(b.total, l)}`}</button></form>
                </>)}
                <details open={mode === "manual"} className="rounded-lg border border-line p-4">
                  <summary className="cursor-pointer font-medium">{tr.payManual}</summary>
                  <p className="mt-2 text-sm">{fill(tr.manualLead, { amount: fmtEgp(b.total, l), ref: b.reference })}</p>
                  <dl className="my-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" dir="ltr">
                    <dt className="text-muted">{tr.instapay}</dt><dd className="font-mono">{process.env.PAY_INSTAPAY_ADDRESS}</dd>
                    <dt className="text-muted">{tr.bank}</dt><dd>{process.env.PAY_BANK_NAME}</dd>
                    <dt className="text-muted">{tr.iban}</dt><dd className="font-mono">{process.env.PAY_BANK_IBAN}</dd>
                    <dt className="text-muted">{tr.accountName}</dt><dd>{process.env.PAY_ACCOUNT_NAME}</dd>
                  </dl>
                  {idOk && b.adultGuests?.length ? <ManualPayForm locale={l} bookingId={b.id} t={tr} err={t.bookingErr} /> : <p className="text-sm text-warn">{!idOk ? tr.idNeeded : t.bookingErr.adults}</p>}
                </details>
              </div>
            </section>
          )}

          {b.status === "payment_review" && <Notice>{tr.reviewNote}</Notice>}

          {confirmed && (
            <section className="card space-y-2 p-5">
              <Notice tone="ok">{tr.confirmedNote}</Notice>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">{tr.address}</dt><dd>{b.listing.address}{b.listing.floor ? `, ${l === "ar" ? "الدور" : "floor"} ${b.listing.floor}` : ""}</dd>
                <dt className="text-muted">{tr.hostPhone}</dt><dd dir="ltr" className="text-start">{host?.displayName} · {hostUser?.phone}</dd>
                <dt className="text-muted">{tr.checkIn}</dt><dd>{fmtDate(b.checkIn, l)} · {b.listing.checkInTime}</dd>
                <dt className="text-muted">{tr.checkOut}</dt><dd>{fmtDate(b.checkOut, l)} · {b.listing.checkOutTime}</dd>
              </dl>
              {b.listing.lat && <a className="link text-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${b.listing.lat},${b.listing.lng}`}>Google Maps ↗</a>}
              <div><Link className="btn btn-sm mt-2" href={`/${l}/trips/${b.id}/voucher`}>{tr.voucher}</Link></div>
            </section>
          )}

          <Thread l={l} t={t} bookingId={b.id} me={cur.user.id} back={back} items={thread} />

          {b.status === "completed" && (
            <section id="review" className="card space-y-3 p-5">
              <h2 className="font-display text-2xl font-semibold">{tr.review}</h2>
              {myReview ? <p className="text-sm text-muted">{tr.reviewThanks}</p> : (
                <form action={reviewAction} className="space-y-3">
                  <input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="back" value={back} />
                  <div><label className="label" htmlFor="rv-r">{tr.rating}</label>
                    <select id="rv-r" name="rating" className="input w-32" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></div>
                  <div><label className="label" htmlFor="rv-c">{tr.comment}</label><textarea id="rv-c" name="comment" className="input min-h-24" required maxLength={2000} /></div>
                  <button className="btn-gold">{tr.postReview}</button>
                </form>)}
            </section>
          )}

          {confirmed && (
            <details className="card p-5">
              <summary className="cursor-pointer font-display text-xl font-semibold">{tr.report}</summary>
              <form action={reportAction} className="mt-3 space-y-3">
                <p className="text-sm text-muted">{tr.reportLead}</p>
                <input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} />
                <div><label className="label" htmlFor="rp-c">{tr.category}</label>
                  <select id="rp-c" name="category" className="input">{Object.entries(tr.cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="label" htmlFor="rp-d">{tr.details}</label><textarea id="rp-d" name="details" className="input min-h-24" required /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="urgent" /> {tr.urgent}</label>
                <button className="btn-navy">{tr.sendReport}</button>
              </form>
            </details>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card space-y-1.5 p-5 text-sm">
            <h2 className="mb-2 font-semibold">{tr.priceDetails}</h2>
            <div className="flex justify-between"><span>{b.nights} {t.common.nights}</span><span className="num">{fmtEgp(b.baseAmount, l)}</span></div>
            {b.cleaningFee > 0 && <div className="flex justify-between"><span>{t.listing.cleaning}</span><span className="num">{fmtEgp(b.cleaningFee, l)}</span></div>}
            <div className="flex justify-between"><span>{fill(t.listing.serviceFee, { fee: pctLabel(GUEST_FEE_BPS) })}</span><span className="num">{fmtEgp(b.guestFee, l)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><span>{t.common.total}</span><span className="num">{fmtEgp(b.total, l)}</span></div>
            {b.payments.filter((p) => p.status === "confirmed").map((p) => <div key={p.id} className="flex justify-between text-ok"><span>{tr.paid} · {p.method}</span><span className="num">{fmtEgp(p.amount, l)}</span></div>)}
            {b.refunds.map((r) => <div key={r.id} className="flex justify-between text-info"><span>↩ {r.status}</span><span className="num">{fmtEgp(r.amount, l)}</span></div>)}
          </div>
          <div className="card p-5 text-xs text-muted"><b className="text-ink">{t.listing.policy}</b><p className="mt-1">{t.policies[b.cancellationPolicy]}</p>{b.nights >= 28 && <p className="mt-1">{t.policies.long}</p>}<p className="mt-1">{t.policies.grace}</p></div>
          {cancellable && preview && (
            <details className="card p-5">
              <summary className="cursor-pointer text-sm font-semibold text-bad">{tr.cancel}</summary>
              <p className="mt-2 text-sm">{tr.cancelTitle} {preview.refund > 0 ? fill(tr.refundPreview, { refund: fmtEgp(preview.refund, l) }) : preview.rule === "unpaid" ? "" : tr.refundNone}</p>
              <form action={cancelAsGuestAction} className="mt-3"><input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={b.id} />
                <button className="btn-bad">{tr.confirmCancel}</button></form>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
