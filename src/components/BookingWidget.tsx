"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { quoteAction, requestBookingAction } from "@/app/actions/guest";
import type { Quote } from "@/lib/pricing";
import { Submit } from "./Submit";

type L = Record<string, string>;
const money = (p: number, ar: boolean) => (ar ? `${Math.round(p / 100).toLocaleString("ar-EG-u-nu-latn")} ج.م` : `E£${Math.round(p / 100).toLocaleString("en-US")}`);

export function BookingWidget(props: {
  listingId: string; locale: string; nightly: number; monthly: number | null; maxGuests: number; instant: boolean;
  signedIn: boolean; own: boolean; initial: { checkIn?: string; checkOut?: string; guests?: number };
  t: L; err: L; feeLabel: string; common: L;
}) {
  const { t, err, locale } = props;
  const ar = locale === "ar";
  const today = new Date().toISOString().slice(0, 10);
  const [checkIn, setIn] = useState(props.initial.checkIn ?? "");
  const [checkOut, setOut] = useState(props.initial.checkOut ?? "");
  const [q, setQ] = useState<{ quote?: Quote; error?: string }>({});
  const [loading, start] = useTransition();
  const [state, act] = useActionState(requestBookingAction, {});

  useEffect(() => {
    if (!checkIn || !checkOut) { setQ({}); return; }
    start(async () => setQ(await quoteAction(props.listingId, checkIn, checkOut)));
  }, [checkIn, checkOut, props.listingId]);

  const quote = q.quote;
  const error = state.error ?? q.error;
  return (
    <form action={act} className="card sticky top-24 space-y-3 border-gold-500/50 p-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="listingId" value={props.listingId} />
      <div>
        <span className="num font-display text-3xl font-semibold">{money(props.nightly, ar)}</span> <span className="text-muted">/ {props.common.perNight}</span>
        {props.monthly ? <div className="text-xs text-muted">{t.monthly.replace("{v}", money(props.monthly, ar))}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="bw-in">{t.checkInL}</label>
          <input id="bw-in" type="date" name="checkIn" className="input" min={today} value={checkIn} onChange={(e) => { setIn(e.target.value); if (checkOut && e.target.value >= checkOut) setOut(""); }} required /></div>
        <div><label className="label" htmlFor="bw-out">{t.checkOutL}</label>
          <input id="bw-out" type="date" name="checkOut" className="input" min={checkIn || today} value={checkOut} onChange={(e) => setOut(e.target.value)} required /></div>
      </div>
      <div><label className="label" htmlFor="bw-g">{t.guestsL}</label>
        <input id="bw-g" type="number" name="guests" className="input" min={1} max={props.maxGuests} defaultValue={Math.min(props.initial.guests ?? 2, props.maxGuests)} /></div>
      {!props.instant && (
        <div><label className="label" htmlFor="bw-m">{t.message}</label>
          <textarea id="bw-m" name="message" className="input min-h-20" maxLength={1000} placeholder={t.messageHint} /></div>
      )}
      <div className="space-y-1.5 border-t border-line pt-3 text-sm" aria-live="polite">
        {loading && <div className="text-muted">{props.common.loading}</div>}
        {!quote && !loading && <div className="text-muted">{t.pickDates}</div>}
        {quote && !loading && (<>
          <div className="flex justify-between"><span>{t.breakdown.replace("{p}", money(Math.round(quote.nightsTotal / quote.nights), ar)).replace("{n}", String(quote.nights))}</span><span className="num">{money(quote.nightsTotal, ar)}</span></div>
          {quote.note && <div className="flex justify-between text-ok"><span>{quote.note === "monthly" ? t.monthlyApplied : t.weeklyApplied}</span><span className="num">−{money(quote.nightsTotal - quote.baseAmount, ar)}</span></div>}
          {quote.cleaningFee > 0 && <div className="flex justify-between"><span>{t.cleaning}</span><span className="num">{money(quote.cleaningFee, ar)}</span></div>}
          <div className="flex justify-between"><span>{t.serviceFee.replace("{fee}", props.feeLabel)}</span><span className="num">{money(quote.guestFee, ar)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 font-bold"><span>{props.common.total} (EGP)</span><span className="num">{money(quote.total, ar)}</span></div>
        </>)}
      </div>
      {error && <p className="text-sm font-semibold text-warn" role="alert">{err[error] ?? err.not_bookable}</p>}
      {props.own ? <button className="btn w-full" disabled>{t.ownListing}</button>
        : !props.signedIn ? <Link className="btn-gold w-full" href={`/${locale}/sign-in?next=/${locale}/listings/${props.listingId}`}>{t.signInToBook}</Link>
        : <Submit className="btn-gold w-full" disabled={!quote || q.error === "unavailable"}>{props.instant ? t.instant : t.request}</Submit>}
      <p className="text-xs text-muted">{props.instant ? t.instantNote : t.notCharged}</p>
    </form>
  );
}
