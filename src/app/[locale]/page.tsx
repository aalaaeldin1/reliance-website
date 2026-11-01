import Link from "next/link";
import { pageCtx, type LP } from "@/lib/page";
import { SearchBar } from "@/components/SearchBar";
import { ListingCard } from "@/components/ListingCard";
import { areaMedians, searchListings } from "@/lib/search";
import { AREAS } from "@/lib/areas";
import { areaName, fill } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Home({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const [medians, cards] = await Promise.all([areaMedians(), searchListings({ sort: "rec" })]);
  const featured = [...cards].sort((a, b) => (b.lastVerifiedAt?.getTime() ?? 0) - (a.lastVerifiedAt?.getTime() ?? 0)).slice(0, 8);
  return (
    <>
      <section className="relative overflow-hidden border-b border-gold-500/30 bg-navy-950 text-mist">
        <div aria-hidden className="pointer-events-none absolute -end-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(232,210,140,.30),rgba(196,154,60,.08)_40%,transparent_70%)]" />
        <svg aria-hidden className="pointer-events-none absolute bottom-0 end-0 h-48 w-[28rem] opacity-25" viewBox="0 0 420 180"><path d="M20 180 L150 30 L280 180Z" fill="#C49A3C" /><path d="M230 180 L320 80 L410 180Z" fill="#96771E" /></svg>
        <div className="wrap relative py-12 sm:py-16">
          <div className="eyebrow text-gold-400">{t.home.eyebrow}</div>
          <h1 className="mt-2 max-w-[16ch] font-display text-5xl font-semibold leading-[1.04] sm:text-6xl">
            {t.home.title1} <em className="text-gold-400">{t.home.title2}</em> {t.home.title3}
          </h1>
          <p className="mb-6 mt-4 max-w-[60ch] text-mist/80">{t.home.lead}</p>
          <SearchBar l={l} t={t} />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-mist/80">
            <span>{t.search.quick}:</span>
            {[1500, 2500, 3500, 5000].map((b) => (
              <Link key={b} href={`/${l}/search?budget=${b}&go=1`} className="rounded-full border border-white/20 px-3 py-1 hover:border-gold-400">
                {fill(t.search.upTo, { v: fmtEgp(b * 100, l) })}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap py-10">
        <h2 className="mb-4 font-display text-3xl font-semibold">{t.home.areas}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {AREAS.map((a) => (
            <Link key={a.id} href={`/${l}/search?area=${a.id}&go=1`} className="card p-3 hover:border-gold-500">
              <div className="font-semibold">{areaName(a, l)}</div>
              <div className="num text-xs text-muted">{medians[a.id] ? `${t.home.typical} ${fmtEgp(medians[a.id].median, l)}` : "—"}</div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="wrap pb-6">
          <h2 className="mb-4 font-display text-3xl font-semibold">{t.home.featured}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{featured.map((c) => <ListingCard key={c.id} c={c} l={l} t={t} />)}</div>
        </section>
      )}

      <section className="wrap grid gap-4 py-10 sm:grid-cols-3">
        {([["why1", "why1d"], ["why2", "why2d"], ["why3", "why3d"]] as const).map(([h, d]) => (
          <div key={h} className="border-t-2 border-gold-500 pt-3"><h3 className="font-display text-2xl font-semibold">{t.home[h]}</h3><p className="mt-1 text-sm text-muted">{t.home[d]}</p></div>
        ))}
      </section>

      <section className="wrap">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-navy-900 p-8 text-mist">
          <div><h2 className="font-display text-3xl font-semibold">{t.home.hostCta}</h2><p className="mt-1 text-mist/75">{t.home.hostCtaLead}</p></div>
          <Link href={`/${l}/host`} className="btn-gold">{t.nav.becomeHost}</Link>
        </div>
      </section>
    </>
  );
}
