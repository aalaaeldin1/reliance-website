import { requireStaff } from "@/lib/auth";
import Link from "next/link";
import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { fraudFlags, hostProfiles, kycDocuments, listings, photos, users, verificationReviews } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { fairnessFor } from "@/lib/listings";
import { areaName, fmtDate, fmtDateTime, type Dict } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { decryptSafe } from "@/lib/safe";
import { photoUrl } from "@/lib/urls";
import { decideListingAction } from "@/app/actions/admin";
import { LISTING_TONE, Notice, Pill } from "@/components/ui";
import { PropertyArt } from "@/components/PropertyArt";

export default async function Approvals({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  await requireStaff(l, ["verifier"]); // the menu hides this page from other roles; this blocks a typed address too
  const sp = await searchParams;
  const a = t.admin;
  const queue = await db.query.listings.findMany({
    where: or(eq(listings.status, "pending"), eq(listings.hasPendingEdits, true)),
    with: { area: true }, orderBy: asc(listings.submittedAt),
  });
  const recheck = await db.query.listings.findMany({
    where: and(eq(listings.status, "live"), eq(listings.hasPendingEdits, false), lt(listings.lastVerifiedAt, new Date(Date.now() - 180 * 86_400_000))),
    with: { area: true }, orderBy: asc(listings.lastVerifiedAt), limit: 20,
  });
  const all = [...queue, ...recheck];
  const sel = all.find((x) => x.id === sp.id) ?? all[0];
  const err = sp.error === "checks" ? a.needChecks : sp.error === "note" ? a.needNote : null;

  let detail: React.ReactNode = <Notice tone="ok">{t.common.noResults}</Notice>;
  if (sel) {
    const [host, hostUser, pics, docs, flags, history, fair] = await Promise.all([
      db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, sel.hostId) }),
      db.query.users.findFirst({ where: eq(users.id, sel.hostId) }),
      db.select().from(photos).where(eq(photos.listingId, sel.id)).orderBy(asc(photos.sortOrder)),
      db.select().from(kycDocuments).where(eq(kycDocuments.userId, sel.hostId)).orderBy(desc(kycDocuments.createdAt)),
      db.select().from(fraudFlags).where(and(eq(fraudFlags.listingId, sel.id), eq(fraudFlags.resolved, false))),
      db.query.verificationReviews.findMany({ where: eq(verificationReviews.listingId, sel.id), orderBy: desc(verificationReviews.decidedAt), limit: 5 }),
      db.query.ratePlans.findFirst({ where: (r, { eq }) => eq(r.listingId, sel.id) }).then((r) => (r ? fairnessFor(sel, r.nightly).then((f) => ({ ...f, nightly: r.nightly })) : null)),
    ]);
    const snap = (sel.pendingSnapshot ?? {}) as Record<string, unknown>;
    const changed = Object.keys(snap).filter((k) => (sel as Record<string, unknown>)[k] !== snap[k]);
    detail = (
      <div className="card space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-display text-3xl font-semibold">{listingTitle(sel, l)}</h2>
            <p className="text-sm text-muted">{t.types[sel.type as keyof Dict["types"]]} · {areaName(sel.area, l)} · {sel.address}{sel.floor ? `, ${sel.floor}` : ""}</p></div>
          <div className="flex flex-col items-end gap-1"><Pill tone={LISTING_TONE[sel.status]}>{t.host.listingStatus[sel.status]}</Pill>
            {sel.hasPendingEdits && <Pill tone="info">{t.host.pendingEdits}</Pill>}
            {recheck.includes(sel) && <Pill tone="warn">{l === "ar" ? "مراجعة كل 6 أشهر" : "6-month re-check"}</Pill>}</div>
        </div>
        {changed.length > 0 && <Notice tone="info">{l === "ar" ? "حقول تغيرت" : "Changed fields"}: {changed.map((k) => `${k}: ${String((sel as Record<string, unknown>)[k])} → ${String(snap[k])}`).join(" · ")}</Notice>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {pics.length ? pics.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={p.id} href={photoUrl(p.fileKey)} target="_blank" rel="noreferrer"><img src={photoUrl(p.fileKey, true)} alt="" className={`aspect-[4/3] w-full rounded object-cover ${p.pending ? "ring-2 ring-info" : ""}`} /></a>))
            : <div className="col-span-2 h-24 overflow-hidden rounded"><PropertyArt seed={sel.id} areaId={sel.areaId} label="" /></div>}
        </div>
        {pics.length < 5 && <Notice tone="warn">{t.wizard.needPhotos}</Notice>}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs uppercase text-muted">{l === "ar" ? "المضيف" : "Host"}</dt><dd>{host?.displayName} · <span dir="ltr">{hostUser?.phone}</span></dd></div>
          <div><dt className="text-xs uppercase text-muted">KYC</dt><dd><Pill tone={host?.kycStatus === "verified" ? "ok" : "warn"}>{host ? t.host.kyc[host.kycStatus] : "—"}</Pill> {host && <span className="text-xs text-muted">{t.host[host.hostType]}</span>}</dd></div>
          <div><dt className="text-xs uppercase text-muted">{t.host.videoCall}</dt><dd>{host?.videoCallAt ? fmtDateTime(host.videoCallAt, l) : "—"}</dd></div>
          <div><dt className="text-xs uppercase text-muted">{l === "ar" ? "السعة" : "Capacity"}</dt><dd>{sel.bedrooms} {t.common.bedrooms} · {sel.baths} {t.common.baths} · {sel.maxGuests} {t.common.guests} · {sel.sizeM2 ?? "?"} m²</dd></div>
          {fair && <div><dt className="text-xs uppercase text-muted">{t.common.price}</dt><dd>{fmtEgp(fair.nightly, l)} <span className={fair.kind === "premium" ? "text-warn" : "text-ok"}>({fair.diffPct > 0 ? "+" : ""}{fair.diffPct}% vs {fmtEgp(fair.peer, l)})</span></dd></div>}
          <div><dt className="text-xs uppercase text-muted">{l === "ar" ? "التحويل" : "Payout"}</dt><dd className="font-mono text-xs">{host ? `${host.payoutMethod} ${decryptSafe(host.payoutAccountEnc)}` : "—"}</dd></div>
        </dl>
        <div><h3 className="mb-1 text-sm font-semibold">{a.docs}</h3>
          <ul className="flex flex-wrap gap-2 text-xs">{docs.length ? docs.map((d) => <li key={d.id}><a className="link" href={`/api/private/${d.fileKey}`} target="_blank" rel="noreferrer">{t.host.docTypes[d.docType as keyof Dict["host"]["docTypes"]] ?? d.docType}</a> <span className="text-muted">({t.host.docStatus[d.status]})</span></li>) : <li className="text-muted">—</li>}</ul>
          <Link className="mt-1 inline-block text-xs text-navy-700 underline" href={`/${l}/admin/kyc`}>{a.nav.kyc} →</Link></div>
        <div><h3 className="mb-1 text-sm font-semibold">{a.flags}</h3>
          {flags.length ? <ul className="space-y-1">{flags.map((f) => <li key={f.id}><Notice tone="bad">{f.kind}: {f.detail}</Notice></li>)}</ul> : <p className="text-xs text-muted">{a.noFlags}</p>}</div>
        <p className="max-w-[70ch] whitespace-pre-line text-sm">{l === "ar" ? sel.descriptionAr || sel.descriptionEn : sel.descriptionEn || sel.descriptionAr}</p>
        {err && <Notice tone="bad">{err}</Notice>}
        {host?.kycStatus !== "verified" && <Notice tone="warn">{a.hostKycPending}</Notice>}
        <form action={decideListingAction} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={sel.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(a.checks) as (keyof Dict["admin"]["checks"])[]).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" name={`check_${k}`} /> {a.checks[k]}</label>))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div><label className="label" htmlFor="ap-n">{a.noteToHost}</label><textarea id="ap-n" name="note" className="input min-h-20" /></div>
            <div><label className="label" htmlFor="ap-r">{a.reasonCode}</label><select id="ap-r" name="reasonCode" className="input"><option value="">—</option>{Object.entries(a.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="approved" className="btn-ok">{a.approve}</button>
            <button name="decision" value="changes_requested" className="btn">{a.requestChanges}</button>
            <button name="decision" value="rejected" className="btn-bad">{a.reject}</button>
          </div>
        </form>
        {history.length > 0 && <ul className="space-y-1 border-t border-line pt-3 text-xs text-muted">{history.map((h) => <li key={h.id}>{fmtDate(h.decidedAt, l)} · {h.decision}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>}
      </div>
    );
  }

  const item = (x: (typeof all)[number], tag?: string) => {
    const age = x.submittedAt ? (Date.now() - x.submittedAt.getTime()) / 3_600_000 : 0;
    return (
      <Link key={x.id} href={`?id=${x.id}`} className={`card block p-3 text-sm hover:border-gold-500 ${sel?.id === x.id ? "border-gold-500 ring-1 ring-gold-500" : ""}`}>
        <div className="font-semibold">{listingTitle(x, l)}</div>
        <div className="text-xs text-muted">{areaName(x.area, l)} · {x.submittedAt ? fmtDate(x.submittedAt, l) : "—"}</div>
        <div className="mt-1 flex gap-1">{tag ? <Pill tone="warn">{tag}</Pill> : x.hasPendingEdits ? <Pill tone="info">{t.host.pendingEdits}</Pill> : <Pill tone="warn">{t.common.new}</Pill>}{age > 48 && !tag && <Pill tone="bad">{a.overdue}</Pill>}</div>
      </Link>);
  };

  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{a.nav.approvals}</h1>
        <p className="text-sm text-muted">{queue.length} · {a.oldest}</p></div>
      {sp.done && <Notice tone="ok">✓ {sp.done}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="space-y-2">{queue.map((x) => item(x))}{recheck.length > 0 && <div className="eyebrow pt-3">{l === "ar" ? "مراجعة دورية" : "Re-check due"}</div>}{recheck.map((x) => item(x, "6 mo"))}</div>
        <div className="min-w-0">{detail}</div>
      </div>
    </>
  );
}
