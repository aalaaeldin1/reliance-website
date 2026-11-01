import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listings, photos } from "@/db/schema";
import { ListingForm, PhotoUploader } from "@/components/HostForms";
import { LISTING_TONE, Notice, PageHead, Pill } from "@/components/ui";
import { wizardProps } from "@/lib/hostpages";
import { photoUrl } from "@/lib/urls";
import { photoAction } from "@/app/actions/host";

export const dynamic = "force-dynamic";

export default async function EditListing({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const { id } = await params;
  const sp = await searchParams;
  const cur = await requireUser(l, `/${l}/host/listings/${id}/edit`);
  const x = await db.query.listings.findFirst({ where: eq(listings.id, id), with: { rate: true } });
  if (!x || x.hostId !== cur.user.id) notFound();
  const pics = await db.select().from(photos).where(eq(photos.listingId, id)).orderBy(asc(photos.sortOrder));
  const snap = (x.pendingSnapshot ?? {}) as Record<string, unknown>;
  const r = x.rate;
  const egp = (p: number | null | undefined) => (p == null ? null : p / 100);
  const d = {
    ...x, ...snap, amenities: x.amenities,
    nightly: egp(r?.nightly), weekend: egp(r?.weekend), weeklyDiscount: r?.weeklyDiscount ?? 0, monthly: egp(r?.monthly), cleaningFee: r?.cleaningFee ? egp(r.cleaningFee) : null,
    minNights: r?.minNights ?? 1, maxNights: r?.maxNights ?? 365,
  } as unknown as Record<string, string | number | boolean | null | string[]>;
  return (
    <div className="wrap max-w-5xl space-y-6 pb-10">
      <PageHead eyebrow={t.host.dashboard} title={t.wizard.editTitle}>
        <div className="flex items-center gap-2"><Pill tone={LISTING_TONE[x.status]}>{t.host.listingStatus[x.status]}</Pill>
          <Link className="btn btn-sm" href={`/${l}/host/listings/${id}/calendar`}>{t.host.calendar}</Link>
          <Link className="btn btn-sm" href={`/${l}/listings/${id}`}>{t.common.view}</Link></div>
      </PageHead>
      {sp.saved && <Notice tone="ok">{t.common.saved} {t.wizard.photosLead}</Notice>}
      {x.hasPendingEdits && <Notice tone="info">{t.host.pendingEdits}</Notice>}
      <section id="photos" className="card space-y-3 p-5">
        <h2 className="font-display text-xl font-semibold">{t.wizard.photos} <span className="text-sm text-muted">({pics.length}/30)</span></h2>
        <p className="text-sm text-muted">{t.wizard.photosLead}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {pics.map((p, i) => (
            <div key={p.id} className="relative overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.fileKey, true)} alt={`${i + 1}`} className={`aspect-[4/3] w-full object-cover ${p.pending ? "opacity-60" : ""}`} />
              <form action={photoAction} className="absolute inset-x-1 bottom-1 flex justify-between">
                <input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={id} /><input type="hidden" name="photoId" value={p.id} />
                {i > 0 ? <button name="op" value="up" className="rounded bg-white/90 px-1.5 text-xs" aria-label="Move earlier">{l === "ar" ? "→" : "←"}</button> : <span className="rounded bg-gold-500 px-1.5 text-[10px] font-bold text-navy-950">1</span>}
                <button name="op" value="delete" className="rounded bg-white/90 px-1.5 text-xs text-bad" aria-label="Delete">✕</button>
              </form>
            </div>))}
        </div>
        <PhotoUploader locale={l} listingId={id} t={t.wizard} />
      </section>
      <ListingForm locale={l} t={t.wizard} d={d} id={id} status={x.status} photoCount={pics.length} {...wizardProps(l, t)} />
    </div>
  );
}
