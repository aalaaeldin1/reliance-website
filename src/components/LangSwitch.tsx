"use client";
import { usePathname, useSearchParams } from "next/navigation";

export function LangSwitch({ locale, label }: { locale: string; label: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const other = locale === "ar" ? "en" : "ar";
  const href = path.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`) + (sp.size ? `?${sp}` : "");
  return (
    <a href={href} onClick={() => { document.cookie = `rs_lang=${other};path=/;max-age=31536000`; }}
      className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-mist hover:border-gold-400" lang={other}>
      {label}
    </a>
  );
}
