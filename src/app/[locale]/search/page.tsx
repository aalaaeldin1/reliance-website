import Link from "next/link";
import { pageCtx } from "@/lib/page";
import { SearchBar } from "@/components/SearchBar";
import { ListingCard } from "@/components/ListingCard";
import { MapView } from "@/components/MapView";
import { Empty } from "@/components/ui";
import { areaMedians, searchListings } from "@/lib/search";
import { AREAS, AMENITIES, LISTING_TYPES } from "@/lib/areas";
import { areaName, fill, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { nightsBetween, parseDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { searchEvents } from "@/db/schema";
import { GUEST_FEE_BPS, pctLabel } from "@/lib/fees";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

const safeDay = (s?: string) => { try { return s ? parseDay(s) : undefined; } catch { return undefined; } };

export default async function Search({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SP> }) {
  const { l, t, cur } = await pageCtx(params);
  const sp = await searchParams;
  const area = AREAS.some((a) => a.id === sp.area) ? sp.area : undefined;
  let checkIn = safeDay(sp.checkIn), checkOut = safeDay(sp.checkOut);
  if (checkIn && checkOut && nightsBetween(checkIn, checkOut) < 1) checkOut = undefined;
  if (!checkIn || !checkOut) { checkIn = undefined; checkOut = undefined; }
  const guests = Math.min(16, Math.max(1, Number(sp.guests) || 1));
  const budgetEgp = Math.max(0, Number(sp.budget) || 0);
  const view = sp.view === "map" ? "map" : "list";
  const sort = (["rec", "value", "low", "high"] as const).find((s) => s === sp.sort) ?? "rec";
  const filters = {
    areaId: area, gov: sp.gov === "Cairo" || sp.gov === "Giza" ? sp.gov : undefined,
    type: LISTING_TYPES.find((x) => x === sp.type), amenity: AMENITIES.find((x) => x === sp.amenity),
    guests, budget: budgetEgp * 100, checkIn, checkOut, sort,
  };
  const [cards, medians] = await Promise.all([searchListings(filters), areaMedians()]);

  if (sp.go === "1") {
    await db.insert(searchEvents).values({
      userId: cur?.user.id ?? null, areaId: area ?? null, checkIn: checkIn ?? null, nights: checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0,
      guests, budget: budgetEgp * 100, resultsCount: cards.length,
    });
  }

  const base = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "go") as [string, string][]);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(base);
    for (const [k, v] of Object.entries(patch)) v ? q.set(k, v) : q.delete(k);
    return `/${l}/search?${q}`;
  };
  const cardQs = checkIn && checkOut ? `?checkIn=${sp.checkIn}&checkOut=${sp.checkOut}&guests=${guests}` : "";
  const fitAreas = budgetEgp ? AREAS.filter((a) => medians[a.id] && medians[a.id].median <= budgetEgp * 100).sort((a, b) => medians[a.id].median - medians[b.id].median) : [];
  const areaLabel = area ? areaName(AREAS.find((a) => a.id === area)!, l) : null;

  return (
    <>
      <section className="border-b border-gold-500/30 bg-navy-950 py-5">
        <div className="wrap space-y-3">
          <SearchBar l={l} t={t} v={{ area, checkIn: sp.checkIn, checkOut: sp.checkOut, guests: String(guests), budget: budgetEgp ? String(budgetEgp) : undefined }} />
          {budgetEgp > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-mist/80">
              {fitAreas.length ? <span>{fill(t.search.fitAreas, { v: fmtEgp(budgetEgp * 100, l) })}</span> : null}
              {fitAreas.map((a) => <Link key={a.id} href={href({ area: a.id })} className="rounded-full border border-white/20 px-3 py-1 hover:border-gold-400">{areaName(a, l)} <b className="text-gold-400">{fmtEgp(medians[a.id].median, l)}</b></Link>)}
            </div>
          )}
        </div>
      </section>
      <div className="wrap">
        <form className="flex flex-wrap items-center gap-2 py-4" action={`/${l}/search`}>
          {Object.entries(sp).filter(([k, v]) => v && !["gov", "type", "amenity", "sort", "go"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select name="gov" defaultValue={sp.gov ?? ""} className="input w-auto" aria-label="Governorate"><option value="">{l === "ar" ? "القاهرة + الجيزة" : "Cairo + Giza"}</option><option value="Cairo">{l === "ar" ? "القاهرة" : "Cairo"}</option><option value="Giza">{l === "ar" ? "الجيزة" : "Giza"}</option></select>
          <select name="type" defaultValue={sp.type ?? ""} className="input w-auto" aria-label={t.search.type}><option value="">{t.search.anyType}</option>{LISTING_TYPES.map((x) => <option key={x} value={x}>{t.types[x]}</option>)}</select>
          <select name="amenity" defaultValue={sp.amenity ?? ""} className="input w-auto" aria-label={t.search.amenity}><option value="">{t.search.anyAmenity}</option>{AMENITIES.map((x) => <option key={x} value={x}>{t.amenities[x]}</option>)}</select>
          <select name="sort" defaultValue={sort} className="input w-auto" aria-label={t.search.sort}>
            <option value="rec">{t.search.sortRec}</option><option value="value">{t.search.sortValue}</option><option value="low">{t.search.sortLow}</option><option value="high">{t.search.sortHigh}</option>
          </select>
          <button className="btn btn-sm">{t.common.filter}</button>
          <Link href={`/${l}/search`} className="text-sm text-muted underline">{t.search.clear}</Link>
          <div className="ms-auto flex overflow-hidden rounded-lg border border-line text-sm">
            <Link href={href({ view: undefined })} className={`px-3 py-1.5 ${view === "list" ? "bg-navy-800 text-white" : ""}`}>{t.search.list}</Link>
            <Link href={href({ view: "map" })} className={`px-3 py-1.5 ${view === "map" ? "bg-navy-800 text-white" : ""}`}>{t.search.map}</Link>
          </div>
        </form>
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
          <h1 className="font-display text-3xl font-semibold">{areaLabel ? fill(t.search.resultsIn, { n: cards.length, area: areaLabel }) : fill(t.search.results, { n: cards.length })}</h1>
          <span className="text-sm text-muted">{fill(t.search.feeNote, { fee: pctLabel(GUEST_FEE_BPS) })}</span>
        </div>
        {!cards.length ? <div className="pb-16"><Empty title={t.search.noneTitle}><p>{t.search.noneLead}</p></Empty></div>
          : view === "map" ? (
            <div className="grid gap-6 pb-16 lg:grid-cols-[1fr_1.2fr]">
              <div className="order-2 grid gap-6 sm:grid-cols-2 lg:order-1">{cards.slice(0, 40).map((c) => <ListingCard key={c.id} c={c} l={l} t={t as Dict} qs={cardQs} />)}</div>
              <div className="order-1 lg:sticky lg:top-24 lg:order-2 lg:self-start">
                <MapView height={600} pins={cards.filter((c) => c.lat && c.lng).map((c) => ({ id: c.id, lat: c.lat!, lng: c.lng!, label: fmtEgp(c.nightly, l), href: `/${l}/listings/${c.id}${cardQs}` }))} />
              </div>
            </div>
          ) : <div className="grid gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-4">{cards.map((c) => <ListingCard key={c.id} c={c} l={l} t={t} qs={cardQs} />)}</div>}
      </div>
    </>
  );
}
