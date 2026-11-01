import { AREAS } from "@/lib/areas";
import { areaName, type Dict, type Locale } from "@/lib/i18n";

export type SearchValues = { area?: string; checkIn?: string; checkOut?: string; guests?: string; budget?: string };

export function SearchBar({ l, t, v = {} }: { l: Locale; t: Dict; v?: SearchValues }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={`/${l}/search`} className="grid gap-2.5 rounded-xl border border-gold-500/45 bg-navy-900 p-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_.7fr_1fr_auto] lg:items-end">
      <input type="hidden" name="go" value="1" />
      <div><label className="label text-gold-400" htmlFor="sb-area">{t.search.where}</label>
        <select id="sb-area" name="area" defaultValue={v.area ?? ""} className="input border-white/15 bg-navy-800 text-mist [color-scheme:dark]">
          <option value="">{t.search.allAreas}</option>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{areaName(a, l)} · {l === "ar" ? (a.governorate === "Cairo" ? "القاهرة" : "الجيزة") : a.governorate}</option>)}
        </select></div>
      <div><label className="label text-gold-400" htmlFor="sb-in">{t.search.checkIn}</label>
        <input id="sb-in" type="date" name="checkIn" min={today} defaultValue={v.checkIn} className="input border-white/15 bg-navy-800 text-mist [color-scheme:dark]" /></div>
      <div><label className="label text-gold-400" htmlFor="sb-out">{t.search.checkOut}</label>
        <input id="sb-out" type="date" name="checkOut" min={today} defaultValue={v.checkOut} className="input border-white/15 bg-navy-800 text-mist [color-scheme:dark]" /></div>
      <div><label className="label text-gold-400" htmlFor="sb-g">{t.search.guests}</label>
        <input id="sb-g" type="number" name="guests" min={1} max={16} defaultValue={v.guests ?? "2"} className="input border-white/15 bg-navy-800 text-mist [color-scheme:dark]" /></div>
      <div><label className="label text-gold-400" htmlFor="sb-b">{t.search.budget}</label>
        <input id="sb-b" type="number" name="budget" min={0} step={100} placeholder={t.search.any} defaultValue={v.budget} className="input border-white/15 bg-navy-800 text-mist [color-scheme:dark]" /></div>
      <button className="btn-gold h-10 sm:col-span-2 lg:col-span-1">{t.common.search}</button>
    </form>
  );
}
