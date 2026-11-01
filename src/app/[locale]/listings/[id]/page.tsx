import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { db } from "@/lib/db";
import { bookings, hostProfiles, listings, photos, reviews, users } from "@/db/schema";
import { fairnessFor, listingDescription, listingTitle } from "@/lib/listings";
import { areaName, fill, fmtDate, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { photoUrl } from "@/lib/urls";
import { GUEST_FEE_BPS, pctLabel } from "@/lib/fees";
import { BookingWidget } from "@/components/BookingWidget";
import { MapView } from "@/components/MapView";
import { PropertyArt } from "@/components/PropertyArt";
import { Notice, Pill, LISTING_TONE } from "@/components/ui";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(id: string) {
  return db.query.listings.findFirst({
    where: eq(listings.id, id),
    with: { area: true, rate: true, photos: { where: eq(photos.pending, false), orderBy: photos.sortOrder } },
  });
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, id } = await params;
  const l = await load(id);
  if (!l || l.status !== "live") return {};
  return { title: listingTitle(l, locale), description: listingDescription(l, locale).slice(0, 160) };
}

export default async function ListingPage({ params, searchParams }: P) {
  const { l, t, cur } = await pageCtx(params);
  const { id } = await params;
  const sp = await searchParams;
  const listing = await load(id);
  if (!listing || !listing.rate) notFound();
  const isOwner = cur?.user.id === listing.hostId;
  const isStaff = cur && cur.user.staffRole !== "none";
  if (listing.status !== "live" && !isOwner && !isStaff) notFound();
  if (!isOwner && listing.status === "live") await db.update(listings).set({ views: sql`${listings.views} + 1` }).where(eq(listings.id, id));

  const [host, guestReviews, fair] = await Promise.all([
    db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, listing.hostId) }),
    db.select({ rating: reviews.rating, comment: reviews.comment, at: reviews.publishedAt, name: users.name })
      .from(reviews).innerJoin(bookings, eq(bookings.id, reviews.bookingId)).innerJoin(users, eq(users.id, reviews.authorId))
      .where(and(eq(bookings.listingId, id), eq(reviews.role, "guest_to_host"), isNotNull(reviews.publishedAt))).orderBy(desc(reviews.publishedAt)).limit(20),
    fairnessFor(listing, listing.rate.nightly),
  ]);
  const title = listingTitle(listing, l);
  const area = areaName(listing.area, l);
  const gov = l === "ar" ? (listing.area.governorate === "Cairo" ? "القاهرة" : "الجيزة") : listing.area.governorate;
  const peerLabel = fair.scope === "area" ? fill(t.listing.peerArea, { area }) : fair.scope === "governorate" ? fill(t.listing.peerGov, { gov }) : fill(t.listing.peerBench, { gov });
  const lo = fair.peer * 0.5, hi = fair.peer * 1.6;
  const pos = Math.max(2, Math.min(98, ((listing.rate.nightly - lo) / (hi - lo)) * 100));
  const fairText = fair.kind === "good" ? fill(t.listing.fairGood, { p: -fair.diffPct }) : fair.kind === "fair" ? t.listing.fairFair : fill(t.listing.fairPremium, { p: fair.diffPct });
  const pics = listing.photos;
  const policy = listing.cancellationPolicy;

  return (
    <div className="wrap py-6">
      {listing.status !== "live" && <div className="mb-4"><Notice tone="warn">{t.host.listingStatus[listing.status]} · <Pill tone={LISTING_TONE[listing.status]}>{listing.status}</Pill></Notice></div>}
      <div className="eyebrow">{area}, {gov}</div>
      <h1 className="mt-1 font-display text-4xl font-semibold">{title}</h1>
      <div className="mb-4 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {listing.ratingAvg ? <span>★ {listing.ratingAvg.toFixed(2)} · {listing.ratingCount} {t.common.reviews}</span> : null}
        <span>✓ {t.listing.verifiedBadge}{listing.lastVerifiedAt ? ` · ${fill(t.listing.lastChecked, { date: fmtDate(listing.lastVerifiedAt, l) })}` : ""}</span>
      </div>

      <div className="grid h-[min(440px,60vw)] grid-cols-1 gap-2 overflow-hidden rounded-2xl sm:grid-cols-[2fr_1fr]">
        {/* eslint-disable @next/next/no-img-element */}
        {pics[0] ? <img src={photoUrl(pics[0].fileKey)} alt={title} className="h-full w-full object-cover" /> : <PropertyArt seed={listing.id} areaId={listing.areaId} label={area} />}
        <div className="hidden grid-rows-2 gap-2 sm:grid">
          {[1, 2].map((i) => pics[i] ? <img key={i} src={photoUrl(pics[i].fileKey, true)} alt="" className="h-full w-full object-cover" /> : <PropertyArt key={i} seed={listing.id + i} areaId={listing.areaId} label={area} />)}
        </div>
      </div>
      {pics.length > 3 && (
        <details className="mt-2"><summary className="cursor-pointer text-sm text-navy-700 underline">+{pics.length - 3} {l === "ar" ? "صور أخرى" : "more photos"}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{pics.slice(3).map((p) => <img key={p.id} src={photoUrl(p.fileKey, true)} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />)}</div>
        </details>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-8">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span>{t.types[listing.type as keyof Dict["types"]]}</span><span>{listing.bedrooms} {t.common.bedrooms}</span><span>{listing.beds} {t.common.beds}</span>
            <span>{listing.baths} {t.common.baths}</span><span>{listing.maxGuests} {t.common.guests}</span>{listing.sizeM2 ? <span>{listing.sizeM2} m²</span> : null}
            {listing.floor ? <span>{l === "ar" ? "الدور" : "Floor"} {listing.floor}</span> : null}
          </div>
          <p className="max-w-[65ch] whitespace-pre-line">{listingDescription(listing, l)}</p>
          <p className="text-sm">{fill(t.listing.hostedBy, { name: host?.displayName ?? "—" })} {host?.kycStatus === "verified" && <Pill tone="ok">{t.common.verified}</Pill>}</p>

          <section><h2 className="mb-3 font-display text-2xl font-semibold">{t.listing.offers}</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">{listing.amenities.map((a) => <li key={a}><span className="text-gold-700">✓</span> {t.amenities[a as keyof Dict["amenities"]] ?? a}</li>)}</ul></section>

          <section><h2 className="mb-2 font-display text-2xl font-semibold">{t.listing.rules}</h2>
            <p className="max-w-[65ch] text-sm text-muted">{listing.houseRules} {fill(t.listing.checkInOut, { in: listing.checkInTime, out: listing.checkOutTime })} {fill(t.listing.minStay, { n: listing.rate.minNights, u: listing.rate.minNights === 1 ? t.common.night : t.common.nights })}</p></section>

          <section><h2 className="mb-2 font-display text-2xl font-semibold">{t.listing.policy}</h2>
            <ul className="max-w-[65ch] space-y-1 text-sm text-muted"><li>{t.policies[policy]}</li><li>{t.policies.long}</li><li>{t.policies.grace}</li></ul></section>

          <section className="rounded-xl bg-mist p-4 text-sm">
            <b>{t.listing.fair}</b>
            <div className="relative mb-1 mt-3 h-2 rounded-full bg-gradient-to-r from-ok via-info to-warn rtl:bg-gradient-to-l"><i className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-ink" style={{ insetInlineStart: `${pos}%` }} /></div>
            <div className="flex justify-between text-[11.5px] text-muted"><span>{l === "ar" ? "قيمة جيدة" : "Good value"}</span><span>{fill(t.listing.typical, { v: fmtEgp(fair.peer, l) })}</span><span>{l === "ar" ? "مميز" : "Premium"}</span></div>
            <div className={`mt-1.5 font-semibold ${fair.kind === "good" ? "text-ok" : fair.kind === "fair" ? "text-info" : "text-warn"}`}>{fairText}</div>
            <div className="mt-1 text-xs text-muted">{l === "ar" ? "مقارنة بـ" : "Compared with"} {peerLabel}. {fill(t.listing.benchmark, { gov, v: fmtEgp(fair.benchmark, l) })}</div>
          </section>

          <section><h2 className="mb-2 font-display text-2xl font-semibold">{t.listing.location}</h2>
            <MapView height={300} zoom={14} pins={[{ id: listing.id, lat: listing.lat ?? listing.area.lat, lng: listing.lng ?? listing.area.lng, label: area, approx: true }]} />
            <p className="mt-2 text-sm text-muted">{t.listing.locationNote}</p></section>

          <section><h2 className="mb-3 font-display text-2xl font-semibold">{t.listing.reviews}</h2>
            {guestReviews.length ? <ul className="space-y-4">{guestReviews.map((r, i) => (
              <li key={i} className="border-b border-line pb-3"><div className="text-sm font-semibold">{r.name.split(" ")[0]} · <span className="text-gold-700">{"★".repeat(r.rating)}</span></div>
                <p className="mt-1 text-sm">{r.comment}</p><div className="text-xs text-muted">{r.at ? fmtDate(r.at, l) : ""}</div></li>))}</ul>
              : <p className="text-sm text-muted">{t.listing.noReviews}</p>}</section>
        </div>
        <div>
          <BookingWidget
            listingId={listing.id} locale={l} nightly={listing.rate.nightly} monthly={listing.rate.monthly} maxGuests={listing.maxGuests}
            instant={listing.instantBook} signedIn={!!cur} own={isOwner} feeLabel={pctLabel(GUEST_FEE_BPS)}
            initial={{ checkIn: sp.checkIn, checkOut: sp.checkOut, guests: Number(sp.guests) || undefined }}
            t={{ ...t.listing, checkInL: t.search.checkIn, checkOutL: t.search.checkOut, guestsL: t.search.guests }} err={t.bookingErr} common={t.common}
          />
        </div>
      </div>
    </div>
  );
}
