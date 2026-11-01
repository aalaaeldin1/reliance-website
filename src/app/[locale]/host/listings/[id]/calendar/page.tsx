import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, calendarDays, listings, ratePlans } from "@/db/schema";
import { HOLDING } from "@/lib/bookings";
import { addDays, dayStr, isWeekendNight, todayUtc } from "@/lib/dates";
import { listingTitle } from "@/lib/listings";
import { fill } from "@/lib/i18n";
import { calendarAction } from "@/app/actions/host";
import { Notice, PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const { id } = await params;
  const sp = await searchParams;
  const cur = await requireUser(l);
  const x = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!x || x.hostId !== cur.user.id) notFound();
  const rate = await db.query.ratePlans.findFirst({ where: eq(ratePlans.listingId, id) });
  const today = todayUtc();
  const offset = Math.max(0, Math.min(11, Number(sp.month) || 0));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 1));
  const [days, held] = await Promise.all([
    db.select().from(calendarDays).where(and(eq(calendarDays.listingId, id), gte(calendarDays.date, start), lt(calendarDays.date, end))),
    db.select().from(bookings).where(and(eq(bookings.listingId, id), inArray(bookings.status, HOLDING), lt(bookings.checkIn, end), gte(bookings.checkOut, start))),
  ]);
  const byDay = new Map(days.map((d) => [dayStr(d.date), d]));
  const bookedOn = (d: Date) => held.find((b) => b.checkIn <= d && b.checkOut > d);
  const w = t.wizard;
  const app = process.env.APP_URL ?? "";
  const weekdays = l === "ar" ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const month = (m0: Date) => {
    const first = m0.getUTCDay();
    const n = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Array.from({ length: first }, () => null as Date | null).concat(Array.from({ length: n }, (_, i) => addDays(m0, i)));
    return (
      <div key={m0.toISOString()} className="card p-4">
        <h3 className="mb-2 font-semibold">{m0.toLocaleDateString(l === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">{weekdays.map((d) => <div key={d}>{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = dayStr(d), c = byDay.get(k), b = bookedOn(d), past = d < today;
            const price = c?.priceOverride ?? (rate ? (isWeekendNight(d) && rate.weekend ? rate.weekend : rate.nightly) : 0);
            const cls = b ? "bg-navy-800 text-white" : c && !c.available ? (c.source === "ical" ? "bg-info/20 text-info line-through" : "bg-bad/15 text-bad line-through") : c?.priceOverride ? "bg-gold-500/20" : "bg-white";
            return (
              <form key={k} action={calendarAction}>
                <input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={id} /><input type="hidden" name="op" value="toggle" /><input type="hidden" name="date" value={k} /><input type="hidden" name="month" value={offset} />
                <button disabled={past || !!b || c?.source === "ical"} title={b ? b.reference : k} className={`num flex h-14 w-full flex-col items-center justify-center rounded border border-line text-xs disabled:cursor-default ${cls} ${past ? "opacity-40" : ""}`}>
                  <span className="font-semibold">{d.getUTCDate()}</span><span className="text-[10px]">{b ? b.reference.slice(3) : Math.round(price / 100)}</span>
                </button>
              </form>);
          })}
        </div>
      </div>);
  };

  return (
    <div className="wrap max-w-5xl space-y-6 pb-10">
      <PageHead eyebrow={listingTitle(x, l)} title={w.calTitle}><Link className="btn btn-sm" href={`/${l}/host/listings/${id}/edit`}>{t.common.edit}</Link></PageHead>
      <p className="text-sm text-muted">{w.calLead}</p>
      {sp.synced && <Notice tone={sp.synced === "error" ? "bad" : "ok"}>{sp.synced === "error" ? t.common.error : fill(w.synced, { n: sp.synced })}</Notice>}
      <div className="flex gap-2">
        {offset > 0 && <Link className="btn btn-sm" href={`?month=${offset - 1}`}>{l === "ar" ? "→" : "←"}</Link>}
        {offset < 10 && <Link className="btn btn-sm" href={`?month=${offset + 1}`}>{l === "ar" ? "←" : "→"}</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{month(start)}{month(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)))}</div>
      <form action={calendarAction} className="card grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={id} /><input type="hidden" name="op" value="range" />
        <div><label className="label" htmlFor="c-f">{w.rangeFrom}</label><input id="c-f" name="from" type="date" className="input" required min={dayStr(today)} /></div>
        <div><label className="label" htmlFor="c-t">{w.rangeTo}</label><input id="c-t" name="to" type="date" className="input" required min={dayStr(today)} /></div>
        <div><label className="label" htmlFor="c-p">{w.rangePrice}</label><input id="c-p" name="price" type="number" min={0} step={50} className="input" /></div>
        <div><label className="label" htmlFor="c-a">{t.common.actions}</label><select id="c-a" name="rangeAction" className="input"><option value="price">{t.common.price}</option><option value="block">{w.block}</option><option value="open">{w.unblock}</option></select></div>
        <button className="btn-navy">{w.applyRange}</button>
      </form>
      <section className="card space-y-3 p-4"><h2 className="font-display text-xl font-semibold">{w.ical}</h2>
        <div><span className="label">{w.icalExport}</span><code className="block overflow-x-auto rounded bg-mist px-3 py-2 text-xs" dir="ltr">{app}/api/ical/{x.icalToken}.ics</code></div>
        <form action={calendarAction} className="flex flex-wrap gap-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="listingId" value={id} />
          <input name="icalUrl" type="url" className="input flex-1" dir="ltr" placeholder="https://www.airbnb.com/calendar/ical/….ics" defaultValue={x.icalImportUrl ?? ""} aria-label={w.icalImport} />
          <button name="op" value="ical" className="btn-navy">{t.common.save}</button>
          {x.icalImportUrl && <button name="op" value="sync" className="btn">{w.syncNow}</button>}</form>
      </section>
    </div>
  );
}
