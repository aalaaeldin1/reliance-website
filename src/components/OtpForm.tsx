"use client";
import { useActionState } from "react";
import { otpAction, type OtpState } from "@/app/actions/auth";
import { Submit } from "./Submit";
import type { Dict } from "@/lib/i18n";

export function OtpForm({ locale, next, t }: { locale: string; next?: string; t: Dict["auth"] }) {
  const [s, act] = useActionState<OtpState, FormData>(otpAction, { step: "phone" });
  const err = s.error ? (t as Record<string, string>)[s.error] : null;
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next ?? ""} />
      {s.step === "phone" && (
        <div>
          <label className="label" htmlFor="phone">{t.phone}</label>
          <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" required dir="ltr" placeholder="010 0000 0000" />
          <p className="mt-1 text-xs text-muted">{t.phoneHint}</p>
        </div>
      )}
      {s.step === "code" && (
        <div>
          <p className="mb-2 text-sm" dir="auto">{t.sentTo.replace("{phone}", s.phone ?? "")}</p>
          {s.devCode && <p className="mb-2 rounded bg-gold-500/15 px-3 py-2 text-sm text-warn">{t.devCode.replace("{code}", s.devCode)}</p>}
          <label className="label" htmlFor="code">{t.code}</label>
          <input id="code" name="code" className="input num tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required dir="ltr" autoFocus />
        </div>
      )}
      {s.step === "name" && (
        <div>
          <label className="label" htmlFor="name">{t.name}</label>
          <input id="name" name="name" className="input" autoComplete="name" required minLength={2} autoFocus />
          <p className="mt-1 text-xs text-muted">{t.nameLead}</p>
        </div>
      )}
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Submit>{s.step === "phone" ? t.sendCode : s.step === "code" ? t.verify : t.continue}</Submit>
        {s.step === "code" && <button className="text-sm text-muted underline" name="restart" value="1">{t.resend}</button>}
      </div>
    </form>
  );
}
