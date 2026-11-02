import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { bookings, hostProfiles, kycDocuments, listings, payouts, verificationReviews } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { fill, fmtDate, fmtDateTime, type Dict } from "@/lib/i18n";
import { fmtEgp, fmtCompact } from "@/lib/money";
import { hostPayoutOf } from "@/lib/bookings";
import { tickIfDue } from "@/lib/jobs";
import { bookVideoCallAction, pauseListingAction } from "@/app/actions/host";
import { DocUploadForm, HostProfileForm } from "@/components/HostForms";
import { BOOKING_TONE, Empty, LISTING_TONE, Notice, PageHead, Pill, Stat, Table } from "@/components/ui";
import { photoUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const REQUIRED: Record<string, string[]> = {
  owner: ["national_id_front", "national_id_back", "title_deed", "utility_bill", "compound_consent"],
  tenant: ["national_id_front", "national_id_back", "lease", "landlord_consent", "compound_consent"],
  manager: ["national_id_front", "national_id_back", "management_agreement", "owner_id", "compound_consent"],
};

function slots() {
  const out: Date[] = [];
  const now = new Date();
  for (let d = 1; d <= 6; d++) for (const h of [8, 10, 12, 14]) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, h)));
  return out;
}

export default async function HostHome({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t, cur } = await pageCtx(params);
  const sp = await searchParams;
  const h = t.host;
  if (!cur) return (
    <div className="wrap max-w-3xl py-14 text-center">
      <h1 className="font-display text-5xl font-semibold">{h.become}</h1>
      <p className="mx-auto mt-3 max-w-xl text-muted">{h.becomeLead}</p>
      <Link className="btn-gold mt-6" href={`/${l}/sign-in?next=/${l}/host`}>{t.nav.signIn}</Link>
    </div>
  );
  await tickIfDue();
  const profile = await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, cur.user.id) });
  if (!profile) return <div className="wrap py-10"><HostProfileForm locale={l} t={h} defaultName={cur.user.name} /></div>;

  const mine = await db.query.listings.findMany({ where: eq(listings.hostId, cur.user.id), with: { photos: true, rate: true }, orderBy: desc(listings.createdAt) });
  const ids = mine.map((x) => x.id);
  const [bk, docs, notes] = await Promise.all([
    ids.length ? db.query.bookings.findMany({ where: inArray(bookings.listingId, ids), with: { listing: true, payout: true, guest: true }, orderBy: desc(bookings.checkIn) }) : [],
    db.select().from(kycDocuments).where(eq(kycDocuments.userId, cur.user.id)),
    ids.length ? db.select().from(verificationReviews).where(inArray(verificationReviews.listingId, ids)).orderBy(desc(verificationReviews.decidedAt)) : [],
  ]);
  const lastNote = (id: string) => notes.find((n) => n.listingId === id)?.note;
  const requests = bk.filter((b) => b.status === "requested");
  const earned = bk.filter((b) => b.payout?.status === "sent").reduce((s, b) => s + (b.payout?.amount ?? 0), 0);
  const upcomingPayout = bk.filter((b) => b.payout && b.payout.status !== "sent").reduce((s, b) => s + (b.payout?.amount ?? 0), 0);
  const docStatus = (type: string) => docs.filter((d) => d.docType === type).sort((a, b) => +b.createdAt - +a.createdAt)[0];
  const steps = [
    ["profile", true], ["verify", profile.kycStatus === "verified"], ["list", mine.length > 0], ["live", mine.some((x) => x.status === "live")],
  ] as const;

  return (
    <div className="wrap pb-10">
      <PageHead eyebrow={h.dashboard} title={fill(h.welcome, { name: profile.displayName })}>
        <Link href={`/${l}/host/listings/new`} className="btn-gold">+ {h.addHome}</Link>
      </PageHead>
      {sp.submitted && <div className="mb-4"><Notice tone="ok">{t.wizard.reviewNote}</Notice></div>}
      <ol className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map(([k, done]) => <li key={k} className={`border-t-2 pt-2 text-sm ${done ? "border-gold-500" : "border-line text-muted"}`}><b className="block text-ink">{done ? "✓ " : ""}{h.steps[k]}</b></li>)}
      </ol>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat k={h.stats.verification} v={<Pill tone={profile.kycStatus === "verified" ? "ok" : profile.kycStatus === "rejected" ? "bad" : "warn"}>{h.kyc[profile.kycStatus]}</Pill>} s={profile.kycReason ?? undefined} />
        <Stat k={h.stats.live} v={`${mine.filter((x) => x.status === "live").length} / ${mine.length}`} />
        <Stat k={h.stats.requests} v={requests.length} s={h.stats.respond} alert={requests.length > 0} />
        <Stat k={h.stats.earnings} v={fmtCompact(earned, l)} s={`${h.stats.earningsNote} · ${fmtCompact(upcomingPayout, l)} ${l === "ar" ? "قادمة" : "upcoming"}`} />
      </div>

      {profile.kycStatus !== "verified" && (
        <section id="verify" className="mb-10 grid gap-6 lg:grid-cols-2">
          <div className="card p-5"><h2 className="font-display text-2xl font-semibold">{h.docs}</h2><p className="mb-3 text-sm text-muted">{h.docsLead}</p>
            {REQUIRED[profile.hostType].map((d) => { const doc = docStatus(d); return <DocUploadForm key={d} locale={l} docType={d} label={h.docTypes[d as keyof Dict["host"]["docTypes"]]} statusLabel={doc ? h.docStatus[doc.status] + (doc.reason ? ` · ${doc.reason}` : "") : undefined} errText={h.docErr} />; })}</div>
          <div className="card p-5"><h2 className="font-display text-2xl font-semibold">{h.videoCall}</h2><p className="mb-3 text-sm text-muted">{h.videoLead}</p>
            {profile.videoCallAt && <Notice tone="ok">{fill(h.booked, { time: fmtDateTime(profile.videoCallAt, l) })}</Notice>}
            <form action={bookVideoCallAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="locale" value={l} />
              <select name="slot" className="input w-auto" aria-label={h.pickSlot}>{slots().map((s) => <option key={s.toISOString()} value={s.toISOString()}>{fmtDateTime(s, l)}</option>)}</select>
              <button className="btn-navy">{h.book}</button></form></div>
        </section>
      )}

      <section className="mb-10 space-y-3"><h2 className="font-display text-2xl font-semibold">{h.homes}</h2>
        {!mine.length ? <Empty title={h.noHomes}><Link className="btn-gold mt-3" href={`/${l}/host/listings/new`}>{h.addHome}</Link></Empty> : (
          <Table><thead><tr><th className="th">{t.common.view}</th><th className="th">{t.common.status}</th><th className="th text-end">{t.common.price}</th><th className="th text-end">{l === "ar" ? "المشاهدات" : "Views"}</th><th className="th">{h.adminNote}</th><th className="th" /></tr></thead>
            <tbody>{mine.map((x) => { const ph = x.photos.sort((a, b) => a.sortOrder - b.sortOrder)[0]; return (
              <tr key={x.id}>
                <td className="td"><div className="flex items-center gap-3"><div className="h-11 w-14 shrink-0 overflow-hidden rounded bg-navy-800">{/* eslint-disable-next-line @next/next/no-img-element */}{ph && <img src={photoUrl(ph.fileKey, true)} alt="" className="h-full w-full object-cover" />}</div>
                  <Link href={`/${l}/listings/${x.id}`} className="font-semibold hover:underline">{listingTitle(x, l)}</Link></div></td>
                <td className="td"><Pill tone={LISTING_TONE[x.status]}>{h.listingStatus[x.status]}</Pill>{x.hasPendingEdits && <div className="mt-1 text-xs text-info">{h.pendingEdits}</div>}</td>
                <td className="td num text-end">{x.rate ? fmtEgp(x.rate.nightly, l) : "—"}</td>
                <td className="td num text-end">{x.views}</td>
                <td className="td max-w-64 text-xs text-muted">{lastNote(x.id) ?? ""}</td>
                <td className="td whitespace-nowrap"><div className="flex gap-1.5">
                  <Link className="btn btn-sm" href={`/${l}/host/listings/${x.id}/edit`}>{t.common.edit}</Link>
                  <Link className="btn btn-sm" href={`/${l}/host/listings/${x.id}/calendar`}>{h.calendar}</Link>
                  {["live", "paused"].includes(x.status) && <form action={pauseListingAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={x.id} /><button className="btn btn-sm">{x.status === "live" ? h.pause : h.resume}</button></form>}
                </div></td>
              </tr>); })}</tbody></Table>)}
      </section>

      <section className="space-y-3"><h2 className="font-display text-2xl font-semibold">{h.requests}</h2>
        {!bk.length ? <Empty title={h.noRequests} /> : (
          <Table><thead><tr><th className="th">{t.common.reference}</th><th className="th">{l === "ar" ? "البيت" : "Home"}</th><th className="th">{t.common.guest}</th><th className="th">{t.common.date}</th><th className="th text-end">{h.payout}</th><th className="th">{t.common.status}</th><th className="th">{h.earnings}</th></tr></thead>
            <tbody>{[...requests, ...bk.filter((b) => b.status !== "requested")].slice(0, 60).map((b) => (
              <tr key={b.id}>
                <td className="td"><Link className="link font-mono text-xs" href={`/${l}/host/bookings/${b.id}`}>{b.reference}</Link></td>
                <td className="td">{listingTitle(b.listing, l)}</td><td className="td">{b.guest.name}</td>
                <td className="td num whitespace-nowrap text-xs">{fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)}</td>
                <td className="td num text-end">{fmtEgp(hostPayoutOf(b), l)}</td>
                <td className="td"><Pill tone={BOOKING_TONE[b.status]}>{t.trips.status[b.status]}</Pill></td>
                <td className="td text-xs">{b.payout ? `${h.payoutStatus[b.payout.status]}${b.payout.status !== "sent" ? " · " + fill(h.due, { date: fmtDate(b.payout.dueAt, l) }) : ""}` : "—"}</td>
              </tr>))}</tbody></Table>)}
      </section>
    </div>
  );
}
