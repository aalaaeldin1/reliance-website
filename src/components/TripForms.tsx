"use client";
import { useActionState, useState } from "react";
import { payManualAction, saveAdultsAction, profileAction, uploadIdAction } from "@/app/actions/guest";
import { Submit } from "./Submit";
import type { AdultGuest } from "@/db/schema";
import type { Dict } from "@/lib/i18n";

type Tr = Dict["trips"];
type Er = Record<string, string>;
type Ac = Dict["account"];

export function AdultsForm({ locale, bookingId, initial, t, err }: { locale: string; bookingId: string; initial: AdultGuest[]; t: Tr; err: Er }) {
  const [rows, setRows] = useState<AdultGuest[]>(initial.length ? initial : [{ name: "", idNumber: "", nationality: locale === "ar" ? "مصري" : "Egyptian" }]);
  const [s, act] = useActionState(saveAdultsAction, {});
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="bookingId" value={bookingId} />
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr_.8fr]">
          <input className="input" name="adultName" placeholder={t.adultName} aria-label={t.adultName} defaultValue={r.name} required={i === 0} />
          <input className="input" name="adultId" placeholder={t.adultId} aria-label={t.adultId} defaultValue={r.idNumber} dir="ltr" required={i === 0} />
          <input className="input" name="adultNat" placeholder={t.adultNat} aria-label={t.adultNat} defaultValue={r.nationality} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, { name: "", idNumber: "", nationality: "" }])}>+ {t.addAdult}</button>
        <Submit className="btn-navy btn-sm">{t.saveAdults}</Submit>
        {s.ok && <span className="text-sm text-ok">✓</span>}
        {s.error && <span className="text-sm text-bad">{err[s.error] ?? err.adults}</span>}
      </div>
    </form>
  );
}

export function ManualPayForm({ locale, bookingId, t, err }: { locale: string; bookingId: string; t: Tr; err: Er }) {
  const [s, act] = useActionState(payManualAction, {});
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="bookingId" value={bookingId} />
      <div><label className="label" htmlFor="mp-m">{t.method}</label>
        <select id="mp-m" name="method" className="input"><option value="instapay">InstaPay</option><option value="bank_transfer">{t.bank}</option></select></div>
      <div><label className="label" htmlFor="mp-r">{t.transferRef}</label><input id="mp-r" name="reference" className="input" dir="ltr" required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="mp-f">{t.proof}</label>
        <input id="mp-f" name="proof" type="file" accept="image/*,application/pdf" className="input" required /></div>
      <div className="sm:col-span-2 flex items-center gap-3"><Submit className="btn-navy">{t.sendProof}</Submit>
        {s.error && <span className="text-sm text-bad" role="alert">{s.error === "proof" ? t.proof : err[s.error] ?? err.state}</span>}</div>
    </form>
  );
}

export function ProfileForm({ locale, user, t }: { locale: string; user: { name: string; email: string | null; language: string }; t: Ac & { save: string; saved: string } }) {
  const [s, act] = useActionState(profileAction, {});
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="locale" value={locale} />
      <div><label className="label" htmlFor="pf-n">{t.name}</label><input id="pf-n" name="name" className="input" defaultValue={user.name} /></div>
      <div><label className="label" htmlFor="pf-e">{t.email}</label><input id="pf-e" name="email" type="email" className="input" defaultValue={user.email ?? ""} dir="ltr" /></div>
      <div><label className="label" htmlFor="pf-l">{t.language}</label>
        <select id="pf-l" name="language" className="input" defaultValue={user.language}><option value="en">English</option><option value="ar">العربية</option></select></div>
      <div className="flex items-center gap-3"><Submit className="btn-navy">{t.save}</Submit>{s.ok && <span className="text-sm text-ok">✓ {t.saved}</span>}</div>
    </form>
  );
}

export function IdUploadForm({ locale, t }: { locale: string; t: Ac }) {
  const [kind, setKind] = useState("national_id");
  const [s, act] = useActionState(uploadIdAction, {});
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="locale" value={locale} />
      <div><label className="label" htmlFor="id-k">{t.idType}</label>
        <select id="id-k" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="national_id">{t.nationalId}</option><option value="passport">{t.passport}</option></select></div>
      <div><label className="label" htmlFor="id-f">{t.front}</label><input id="id-f" name="front" type="file" accept="image/*,application/pdf" className="input" required /></div>
      {kind === "national_id" && <div><label className="label" htmlFor="id-b">{t.back}</label><input id="id-b" name="back" type="file" accept="image/*,application/pdf" className="input" required /></div>}
      <div className="flex items-center gap-3 sm:col-span-3"><Submit className="btn-navy">{t.upload}</Submit>{s.ok && <span className="text-sm text-ok">✓</span>}{s.error && <span className="text-sm text-bad">{s.error}</span>}</div>
    </form>
  );
}
