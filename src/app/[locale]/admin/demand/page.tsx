import { pageCtx, type LP } from "@/lib/page";
import { demandMetrics } from "@/lib/metrics";
import { areaName } from "@/lib/i18n";
import { fmtEgp, fmtCompact } from "@/lib/money";
import { Bars, ChartCard, Columns } from "@/components/Charts";
import { Stat, Table } from "@/components/ui";

export default async function Demand({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const m = await demandMetrics(60);
  const c = t.admin.charts;
  const ar = l === "ar";
  const recruit = m.byArea.filter((x) => x.searches > 0).map((x) => ({ ...x, ratio: x.supply ? x.searches / x.supply : Infinity })).sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  const band = (a: number, b: number) => (b === Infinity ? `${fmtCompact(a, "en")}+` : `${fmtCompact(a, "en")}–${fmtCompact(b, "en")}`);
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.demand}</h1>
        <p className="text-sm text-muted">{ar ? "آخر 60 يومًا. كل عملية بحث مسجلة: المنطقة والتواريخ وعدد الضيوف والميزانية." : "Last 60 days. Every search is logged: area, dates, party size and budget."}</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat k={ar ? "عمليات بحث" : "Searches"} v={m.total} s={`${m.noArea} ${ar ? "بدون منطقة" : "without an area"} · ${m.zeroResults} ${ar ? "بلا نتائج" : "with no results"}`} />
        <Stat k={ar ? "ضيوف يبحثون" : "Guests searching"} v={m.searchers} />
        <Stat k={ar ? "حجزوا" : "Went on to book"} v={m.bookers} s={m.searchers ? `${((m.bookers / m.searchers) * 100).toFixed(1)}%` : ""} />
        <Stat k={ar ? "متوسط ميزانية الضيف" : "Median guest budget"} v={m.medianBudget ? fmtEgp(m.medianBudget, l) : "—"} s={`${ar ? "متوسط السعر المنشور" : "Median live price"} ${fmtEgp(m.medianPrice, l)}`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={c.demandSupply}><Bars rows={m.byArea.map((x) => ({ label: areaName(x.area, l), v: x.searches }))} rows2={m.byArea.map((x) => ({ label: areaName(x.area, l), v: x.supply }))} fmt={String} legend={[ar ? "عمليات بحث" : "Searches", ar ? "بيوت منشورة" : "Live homes"]} /></ChartCard>
        <ChartCard title={c.budgetVsPrice}><Columns rows={m.bands.map((b) => ({ label: band(b.a, b.b), v: b.budgets }))} rows2={m.bands.map((b) => ({ label: band(b.a, b.b), v: b.homes }))} fmt={(v) => String(Math.round(v))} legend={[ar ? "ميزانيات الضيوف" : "Guest budgets", ar ? "بيوت منشورة" : "Live homes"]} /></ChartCard>
        <ChartCard title={c.party}><Bars rows={m.party.map((p) => ({ label: p.n === 6 ? "6+" : String(p.n), v: p.v }))} fmt={String} /></ChartCard>
        <ChartCard title={c.stay}><Bars rows={m.stay.map((s) => ({ label: s.b > 1000 ? "28+" : `${s.a}–${s.b}`, v: s.v }))} fmt={String} /></ChartCard>
      </div>
      <ChartCard title={c.recruit} sub={ar ? "مرتبة حسب عمليات البحث لكل بيت منشور." : "Ranked by searches per live home. Red price = area median above what guests search with."}>
        <Table><thead><tr><th className="th">{t.common.area}</th><th className="th text-end">{ar ? "بحث" : "Searches"}</th><th className="th text-end">{ar ? "منشور" : "Live"}</th><th className="th text-end">{ar ? "لكل بيت" : "Per home"}</th><th className="th text-end">{ar ? "ميزانية الضيف" : "Guest budget"}</th><th className="th text-end">{ar ? "متوسط السعر" : "Area median"}</th></tr></thead>
          <tbody>{recruit.map((x) => <tr key={x.area.id}><td className="td">{areaName(x.area, l)}</td><td className="td num text-end">{x.searches}</td><td className="td num text-end">{x.supply}</td>
            <td className="td num text-end font-semibold">{x.supply ? x.ratio.toFixed(1) : ar ? "لا يوجد" : "No supply"}</td><td className="td num text-end">{x.budget ? fmtEgp(x.budget, l) : "—"}</td>
            <td className={`td num text-end ${x.budget && x.price > x.budget ? "font-semibold text-bad" : ""}`}>{x.price ? fmtEgp(x.price, l) : "—"}</td></tr>)}</tbody></Table>
      </ChartCard>
    </>
  );
}
