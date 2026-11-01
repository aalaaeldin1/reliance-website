"use client";
import { useActionState } from "react";
import { staffTotpAction } from "@/app/actions/auth";
import { Submit } from "./Submit";
import type { Dict } from "@/lib/i18n";

export function TotpForm({ locale, secret, t }: { locale: string; secret: string; t: Dict["admin"] }) {
  const [s, act] = useActionState(staffTotpAction, {});
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="secret" value={secret} />
      <div><label className="label" htmlFor="totp">{t.code}</label><input id="totp" name="code" className="input num tracking-[0.4em]" inputMode="numeric" maxLength={6} required dir="ltr" autoFocus /></div>
      {s.error && <p className="text-sm text-bad">{t.badTotp}</p>}
      <Submit>{t.confirm}</Submit>
    </form>
  );
}
