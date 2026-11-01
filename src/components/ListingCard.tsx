import Link from "next/link";
import type { Card } from "@/lib/search";
import { fill, type Dict, type Locale } from "@/lib/i18n";
import { fmtEgp, fmtCompact } from "@/lib/money";
import { photoUrl } from "@/lib/urls";
import { PropertyArt } from "./PropertyArt";

export function ListingCard({ c, l, t, qs = "" }: { c: Card; l: Locale; t: Dict; qs?: string }) {
  const title = (l === "ar" ? c.titleAr || c.titleEn : c.titleEn || c.titleAr) || "—";
  const area = l === "ar" ? c.areaAr : c.areaEn;
  const fair = c.fair.kind === "good" ? fill(t.listing.fairGood, { p: -c.fair.diffPct }) : c.fair.kind === "fair" ? t.listing.fairFair : fill(t.listing.fairPremium, { p: c.fair.diffPct });
  const fairCls = c.fair.kind === "good" ? "text-ok" : c.fair.kind === "fair" ? "text-info" : "text-warn";
  return (
    <Link href={`/${l}/listings/${c.id}${qs}`} className="group flex flex-col gap-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-navy-800 ring-gold-500 transition group-hover:ring-2">
        {c.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photoUrl(c.photo, true)} alt={title} className="h-full w-full object-cover" loading="lazy" />
          : <PropertyArt seed={c.id} areaId={c.areaId} label={area} />}
        <span className="pill absolute start-2.5 top-2.5 bg-navy-950/75 text-gold-200">✓ {t.listing.verifiedBadge}</span>
        {c.sample && <span className="absolute end-2.5 top-2.5 rounded bg-navy-950/70 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-gold-200">{t.common.sample}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="num shrink-0 text-sm">{c.ratingAvg ? `★ ${c.ratingAvg.toFixed(2)}` : <span className="text-xs text-muted">{t.search.newListing}</span>}</span>
      </div>
      <div className="text-sm text-muted">{t.types[c.type as keyof Dict["types"]] ?? c.type} · {area} · {c.bedrooms} {t.common.bedrooms} · {c.maxGuests} {t.common.guests}</div>
      <div className="num text-[15px]"><b>{fmtEgp(c.nightly, l)}</b> / {t.common.perNight}{c.monthly ? <span className="text-muted"> · {fmtCompact(c.monthly, l)}/{l === "ar" ? "شهر" : "mo"}</span> : null}</div>
      {c.total != null && <div className="num text-xs text-muted">{fill(t.search.totalFor, { v: fmtEgp(c.total, l), n: c.nights })}</div>}
      <div className={`text-xs font-semibold ${fairCls}`}>{fair}</div>
    </Link>
  );
}
