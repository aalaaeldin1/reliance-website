"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createHostProfileAction, saveListingAction, suggestAction, uploadHostDocAction, uploadPhotosAction, type SaveState } from "@/app/actions/host";
import { Submit } from "./Submit";
import type { Dict } from "@/lib/i18n";

type H = Dict["host"]; type W = Dict["wizard"];
const money = (p: number, ar: boolean) => (ar ? `${Math.round(p / 100).toLocaleString("ar-EG-u-nu-latn")} ج.م` : `E£${Math.round(p / 100).toLocaleString("en-US")}`);

export function HostProfileForm({ locale, t, defaultName }: { locale: string; t: H; defaultName: string }) {
  const [s, act] = useActionState(createHostProfileAction, {});
  return (
    <form action={act} className="card grid max-w-3xl gap-4 p-6 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-display text-2xl font-semibold sm:col-span-2">{t.become}</h2>
      <p className="text-sm text-muted sm:col-span-2">{t.becomeLead}</p>
      <div><label className="label" htmlFor="hp-t">{t.hostType}</label>
        <select id="hp-t" name="hostType" className="input"><option value="owner">{t.owner}</option><option value="tenant">{t.tenant}</option><option value="manager">{t.manager}</option></select></div>
      <div><label className="label" htmlFor="hp-n">{t.displayName}</label><input id="hp-n" name="displayName" className="input" defaultValue={defaultName} required minLength={2} /></div>
      <div><label className="label" htmlFor="hp-m">{t.payoutMethod}</label>
        <select id="hp-m" name="payoutMethod" className="input"><option value="bank">{t.payoutBank}</option><option value="instapay">{t.payoutInstapay}</option><option value="wallet">{t.payoutWallet}</option></select></div>
      <div><label className="label" htmlFor="hp-a">{t.payoutAccount}</label><input id="hp-a" name="payoutAccount" className="input" dir="ltr" required minLength={5} /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="agree" required className="mt-1" /> {t.agree}</label>
      <div className="sm:col-span-2"><Submit>{t.create}</Submit>{s.error && <span className="ms-3 text-sm text-bad">✗</span>}</div>
    </form>
  );
}

export function DocUploadForm({ locale, docType, label, statusLabel }: { locale: string; docType: string; label: string; statusLabel?: string }) {
  const [s, act] = useActionState(uploadHostDocAction, {});
  return (
    <form action={act} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="docType" value={docType} />
      <span className="min-w-48 flex-1 text-sm font-medium">{label}</span>
      {statusLabel && <span className="text-xs text-muted">{statusLabel}</span>}
      <input name="file" type="file" accept="image/*,application/pdf" required className="max-w-56 text-xs" aria-label={label} />
      <Submit className="btn btn-sm">↑</Submit>
      {s.ok && <span className="text-ok">✓</span>}{s.error && <span className="text-bad">✗</span>}
    </form>
  );
}

export function PhotoUploader({ locale, listingId, t }: { locale: string; listingId: string; t: W }) {
  const [s, act] = useActionState(uploadPhotosAction, {});
  return (
    <form action={act} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="listingId" value={listingId} />
      <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="text-sm" aria-label={t.addPhotos} />
      <Submit className="btn-navy btn-sm">{t.addPhotos}</Submit>
      {s.added ? <span className="text-sm text-ok">+{s.added}</span> : null}
      {s.error && <span className="text-sm text-bad">{(t.photoErr as Record<string, string>)[s.error] ?? s.error}</span>}
    </form>
  );
}

export type ListingDefaults = Partial<Record<string, string | number | boolean | null | string[]>>;

export function ListingForm(props: {
  locale: string; t: W; types: Record<string, string>; amenities: Record<string, string>; areas: { id: string; name: string }[];
  policies: Record<string, string>; id?: string; d: ListingDefaults; photoCount: number; status?: string; errors: Record<string, string>;
}) {
  const { t, d, locale } = props;
  const ar = locale === "ar";
  const [s, act] = useActionState<SaveState, FormData>(saveListingAction, {});
  const [area, setArea] = useState(String(d.areaId ?? props.areas[0].id));
  const [beds, setBeds] = useState(Number(d.bedrooms ?? 1));
  const [nightly, setNightly] = useState(String(d.nightly ?? ""));
  const [sug, setSug] = useState<{ value: number; scope: string; count: number; gov: string } | null>(null);
  const [, start] = useTransition();
  useEffect(() => { start(async () => setSug(await suggestAction(area, beds, props.id))); }, [area, beds, props.id]);
  const bad = (f: string) => s.fields?.includes(f) ? "border-bad" : "";
  const v = (k: string) => (d[k] == null ? "" : String(d[k]));
  const amen = (d.amenities as string[] | undefined) ?? ["wifi", "ac", "kitchen"];
  const src = sug ? (sug.scope === "benchmark" ? (ar ? `متوسط Airbnb في ${sug.gov === "Cairo" ? "القاهرة" : "الجيزة"}` : `the Airbnb ${sug.gov} average`) : `${sug.count} ${ar ? "بيوت مشابهة" : "similar live homes"}`) : "";
  const live = props.status === "live" || props.status === "paused";

  return (
    <form action={act} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {props.id && <input type="hidden" name="id" value={props.id} />}
      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2"><legend className="px-1 font-display text-xl font-semibold">{t.basics}</legend>
        <div><label className="label" htmlFor="f-te">{t.titleEn}</label><input id="f-te" name="titleEn" className={`input ${bad("titleEn")}`} maxLength={80} defaultValue={v("titleEn")} dir="ltr" /></div>
        <div><label className="label" htmlFor="f-ta">{t.titleAr}</label><input id="f-ta" name="titleAr" className="input" maxLength={80} defaultValue={v("titleAr")} dir="rtl" /></div>
        <div><label className="label" htmlFor="f-ty">{t.type}</label><select id="f-ty" name="type" className="input" defaultValue={v("type") || "apartment"}>{Object.entries(props.types).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="f-ar">{t.area}</label><select id="f-ar" name="areaId" className="input" value={area} onChange={(e) => setArea(e.target.value)}>{props.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </fieldset>
      <fieldset className="card grid gap-4 p-5 sm:grid-cols-4"><legend className="px-1 font-display text-xl font-semibold">{t.location}</legend>
        <div className="sm:col-span-3"><label className="label" htmlFor="f-ad">{t.address}</label><input id="f-ad" name="address" className={`input ${bad("address")}`} required minLength={5} defaultValue={v("address")} /><p className="mt-1 text-xs text-muted">{t.addressHint}</p></div>
        <div><label className="label" htmlFor="f-fl">{t.floor}</label><input id="f-fl" name="floor" className="input" maxLength={10} defaultValue={v("floor")} /></div>
        <div><label className="label" htmlFor="f-la">{t.lat}</label><input id="f-la" name="lat" className={`input ${bad("lat")}`} inputMode="decimal" defaultValue={v("lat")} dir="ltr" /></div>
        <div><label className="label" htmlFor="f-ln">{t.lng}</label><input id="f-ln" name="lng" className={`input ${bad("lng")}`} inputMode="decimal" defaultValue={v("lng")} dir="ltr" /></div>
        <p className="self-end text-xs text-muted sm:col-span-2">{t.pinHint}</p>
      </fieldset>
      <fieldset className="card space-y-4 p-5"><legend className="px-1 font-display text-xl font-semibold">{t.space}</legend>
        <div className="grid gap-4 sm:grid-cols-5">
          <div><label className="label" htmlFor="f-br">{t.bedrooms}</label><input id="f-br" name="bedrooms" type="number" min={0} max={20} className="input" value={beds} onChange={(e) => setBeds(Number(e.target.value))} required /></div>
          <div><label className="label" htmlFor="f-bd">{t.beds}</label><input id="f-bd" name="beds" type="number" min={1} max={30} className="input" defaultValue={v("beds") || 1} required /></div>
          <div><label className="label" htmlFor="f-ba">{t.baths}</label><input id="f-ba" name="baths" type="number" min={1} max={20} className="input" defaultValue={v("baths") || 1} required /></div>
          <div><label className="label" htmlFor="f-mg">{t.maxGuests}</label><input id="f-mg" name="maxGuests" type="number" min={1} max={30} className="input" defaultValue={v("maxGuests") || 2} required /></div>
          <div><label className="label" htmlFor="f-sz">{t.size}</label><input id="f-sz" name="sizeM2" type="number" min={10} max={5000} className="input" defaultValue={v("sizeM2")} /></div>
        </div>
        <div><span className="label">{t.amenities}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(props.amenities).map(([k, x]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" name="amenities" value={k} defaultChecked={amen.includes(k)} /> {x}</label>))}</div></div>
      </fieldset>
      <fieldset className="card grid gap-4 p-5 sm:grid-cols-2"><legend className="px-1 font-display text-xl font-semibold">{t.describe}</legend>
        <div><label className="label" htmlFor="f-de">{t.descEn}</label><textarea id="f-de" name="descriptionEn" className={`input min-h-32 ${bad("descriptionEn")}`} maxLength={3000} defaultValue={v("descriptionEn")} dir="ltr" placeholder={t.descHint} /></div>
        <div><label className="label" htmlFor="f-da">{t.descAr}</label><textarea id="f-da" name="descriptionAr" className="input min-h-32" maxLength={3000} defaultValue={v("descriptionAr")} dir="rtl" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="f-hr">{t.houseRules}</label><textarea id="f-hr" name="houseRules" className="input min-h-20" maxLength={2000} defaultValue={v("houseRules") || (ar ? "هوية سارية لكل ضيف بالغ عند الوصول. ممنوع الحفلات. ممنوع التدخين داخل البيت." : "Valid ID for every adult guest at check-in. No parties or events. No smoking indoors.")} /></div>
      </fieldset>
      <fieldset className="card space-y-4 p-5"><legend className="px-1 font-display text-xl font-semibold">{t.pricing}</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <div><label className="label" htmlFor="f-ni">{t.nightly}</label><input id="f-ni" name="nightly" type="number" min={200} step={50} className={`input ${bad("nightly")}`} value={nightly} onChange={(e) => setNightly(e.target.value)} required /></div>
          <div><label className="label" htmlFor="f-we">{t.weekend}</label><input id="f-we" name="weekend" type="number" min={0} step={50} className="input" defaultValue={v("weekend")} /></div>
          <div><label className="label" htmlFor="f-wk">{t.weekly}</label><input id="f-wk" name="weeklyDiscount" type="number" min={0} max={50} className="input" defaultValue={v("weeklyDiscount") || 0} /></div>
          <div><label className="label" htmlFor="f-mo">{t.monthly}</label><input id="f-mo" name="monthly" type="number" min={0} step={500} className="input" defaultValue={v("monthly")} /></div>
          <div><label className="label" htmlFor="f-cl">{t.cleaningFee}</label><input id="f-cl" name="cleaningFee" type="number" min={0} step={50} className="input" defaultValue={v("cleaningFee")} /></div>
          <div><label className="label" htmlFor="f-mn">{t.minNights}</label><input id="f-mn" name="minNights" type="number" min={1} max={90} className="input" defaultValue={v("minNights") || 1} /></div>
          <div><label className="label" htmlFor="f-mx">{t.maxNights}</label><input id="f-mx" name="maxNights" type="number" min={1} max={365} className="input" defaultValue={v("maxNights") || 365} /></div>
        </div>
        {sug && (() => {
          const n = Number(nightly) * 100, diff = n ? (n - sug.value) / sug.value : 0;
          return (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gold-500/15 px-4 py-3 text-sm">
              <b>{t.suggested.replace("{v}", money(sug.value, ar))}</b><span className="text-muted">{t.suggestedFrom.replace("{src}", src)}</span>
              {n > 0 && <span className={`font-semibold ${diff <= -0.1 ? "text-ok" : diff < 0.1 ? "text-info" : "text-warn"}`}>{diff > 0 ? "+" : ""}{Math.round(diff * 100)}%</span>}
              <button type="button" className="btn btn-sm" onClick={() => setNightly(String(sug.value / 100))}>{t.useSuggestion}</button>
            </div>);
        })()}
        <div className="grid gap-4 sm:grid-cols-4">
          <div><label className="label" htmlFor="f-ci">{t.checkIn}</label><input id="f-ci" name="checkInTime" type="time" className="input" defaultValue={v("checkInTime") || "15:00"} /></div>
          <div><label className="label" htmlFor="f-co">{t.checkOut}</label><input id="f-co" name="checkOutTime" type="time" className="input" defaultValue={v("checkOutTime") || "12:00"} /></div>
          <div><label className="label" htmlFor="f-ib">{t.instant}</label><select id="f-ib" name="instantBook" className="input" defaultValue={d.instantBook ? "1" : "0"}><option value="0">{t.instantNo}</option><option value="1">{t.instantYes}</option></select></div>
          <div><label className="label" htmlFor="f-cp">{t.policy}</label><select id="f-cp" name="cancellationPolicy" className="input" defaultValue={v("cancellationPolicy") || "moderate"}>{Object.entries(props.policies).map(([k, x]) => <option key={k} value={k} title={x}>{x.split(":")[0]}</option>)}</select></div>
        </div>
      </fieldset>
      {s.error && <p className="text-sm font-semibold text-bad" role="alert">{s.error === "photos" ? t.needPhotos : props.errors[s.error] ?? props.errors.invalid}</p>}
      {s.ok && <p className="text-sm text-ok">✓</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Submit className="btn" name="intent" value="draft">{t.saveDraft}</Submit>
        {props.id && <Submit name="intent" value="submit">{live ? t.resubmit : t.submit}</Submit>}
        <span className="text-xs text-muted">{t.reviewNote}</span>
      </div>
    </form>
  );
}
