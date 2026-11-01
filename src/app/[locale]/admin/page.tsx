import { pageCtx, type LP } from "@/lib/page";
import { overviewMetrics } from "@/lib/metrics";
import { AREAS } from "@/lib/areas";
import { areaName } from "@/lib/i18n";
import { fmtCompact, fmtEgp } from "@/lib/money";
import { BENCHMARK_ADR } from "@/lib/pricing";
import { GUEST_FEE_BPS, HOST_FEE_BPS, pctLabel } from "@/lib/fees";
import { Bars, ChartCard, Columns } from "@/components/Charts";
import { Notice, Stat } from "@/components/ui";

export default async function Overview({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const sp = await searchParams;
  const area = AREAS.find((a) => a.id === sp.area)?.id;
  const days = [30, 84, 365].includes(Number(sp.days)) ? Number(sp.days) : 84;
  const m = await overviewMetrics({ areaId: area, days });
  const k = t.admin.kpi, c = t.admin.charts;
  const statusLabel = t.host.listingStatus;
  return (
    <>
      {sp.denied && <Notice tone="warn">{t.admin.denied}</Notice>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.overview}</h1></div>
        <form className="flex gap-2">
          <select name="area" defaultValue={area ?? ""} className="input w-auto" aria-label={t.common.area}><option value="">{t.search.allAreas}</option>{AREAS.map((a) => <option key={a.id} value={a.id}>{areaName(a, l)}</option>)}</select>
          <select name="days" defaultValue={String(days)} className="input w-auto" aria-label={t.common.date}><option value="30">30 {l === "ar" ? "يومًا" : "days"}</option><option value="84">12 {l === "ar" ? "أسبوعًا" : "weeks"}</option><option value="365">12 {l === "ar" ? "شهرًا" : "months"}</option></select>
          <button className="btn btn-sm">{t.common.filter}</button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat k={k.live} v={m.live} />
        <Stat k={k.pending} v={m.pending} alert={m.pending > 0} />
        <Stat k={k.gbv} v={fmtCompact(m.gbv, l)} s={`${m.stays} ${l === "ar" ? "إقامة مؤكدة" : "confirmed stays"}`} />
        <Stat k={k.revenue} v={fmtCompact(m.revenue, l)} s={`${pctLabel(GUEST_FEE_BPS)} + ${pctLabel(HOST_FEE_BPS)}`} />
        <Stat k={k.adr} v={fmtEgp(m.adr, l)} s={`Airbnb: Cairo ${fmtEgp(BENCHMARK_ADR.Cairo, l)} · Giza ${fmtEgp(BENCHMARK_ADR.Giza, l)}`} />
        <Stat k={k.occupancy} v={`${m.occupancy.toFixed(1)}%`} s="Airbnb Cairo 34.0%" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={c.weekly} sub={c.weeklySub}><Columns rows={m.weeks} fmt={(v) => fmtCompact(v, "en")} /></ChartCard>
        <ChartCard title={c.byArea}><Bars rows={[...m.byArea].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ label: areaName(AREAS.find((a) => a.id === id)!, l), v }))} fmt={(v) => fmtCompact(v, l)} /></ChartCard>
        <ChartCard title={c.pipeline}><Bars rows={m.pipeline.map((p) => ({ label: statusLabel[p.status], v: p.n }))} fmt={String} /></ChartCard>
        <ChartCard title={c.payMix}><Bars rows={m.payRows.map((p) => ({ label: p.method, v: p.n }))} fmt={String} /></ChartCard>
      </div>
    </>
  );
}
