import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "./Logo";
import { LangSwitch } from "./LangSwitch";
import type { Dict, Locale } from "@/lib/i18n";
import type { User } from "@/db/schema";
import { signOutAction } from "@/app/actions/auth";

export function Header({ l, t, user }: { l: Locale; t: Dict; user: User | null }) {
  const isStaff = user && user.staffRole !== "none";
  return (
    <header className="sticky top-0 z-30 border-b border-gold-500/35 bg-navy-950 text-mist">
      <div className="wrap flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2 py-2">
        <Link href={`/${l}`} aria-label={t.brand}><Logo sub={l === "ar" ? "إقامات · القاهرة والجيزة" : "STAYS · CAIRO & GIZA"} /></Link>
        <nav className="ms-auto flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href={`/${l}/search`}>{t.nav.find}</Link>
          {user && <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href={`/${l}/trips`}>{t.nav.trips}</Link>}
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href={`/${l}/host`}>{user ? t.nav.host : t.nav.becomeHost}</Link>
          {isStaff && <Link className="rounded-full px-3 py-1.5 text-gold-200 hover:bg-white/10" href={`/${l}/admin`}>{t.nav.admin}</Link>}
          {user ? (
            <>
              <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href={`/${l}/account`}>{user.name || t.nav.account}</Link>
              <form action={signOutAction}><input type="hidden" name="locale" value={l} />
                <button className="rounded-full px-3 py-1.5 text-mist/70 hover:bg-white/10">{t.nav.signOut}</button></form>
            </>
          ) : (
            <Link className="rounded-full bg-gold-500 px-4 py-1.5 font-semibold text-navy-950 hover:bg-gold-400" href={`/${l}/sign-in`}>{t.nav.signIn}</Link>
          )}
          <Suspense><LangSwitch locale={l} label={t.nav.language} /></Suspense>
        </nav>
      </div>
    </header>
  );
}

export function Footer({ l, t }: { l: Locale; t: Dict }) {
  return (
    <footer className="mt-16 border-t border-gold-500/30 bg-navy-950 text-mist/80">
      <div className="wrap grid gap-6 py-10 sm:grid-cols-[1fr_auto]">
        <div className="max-w-md space-y-3">
          <Logo sub={t.tagline.toUpperCase()} />
          <p className="text-sm">{t.footer.about}</p>
        </div>
        <div className="flex gap-5 text-sm">
          <Link href={`/${l}/legal/terms`} className="hover:text-gold-200">{t.footer.terms}</Link>
          <Link href={`/${l}/legal/privacy`} className="hover:text-gold-200">{t.footer.privacy}</Link>
          <Link href={`/${l}/legal/help`} className="hover:text-gold-200">{t.footer.help}</Link>
        </div>
        <p className="text-xs text-mist/50">© {new Date().getUTCFullYear()} Reliance. {t.footer.rights}</p>
      </div>
    </footer>
  );
}
