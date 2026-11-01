import { desc } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { db } from "@/lib/db";
import { cases } from "@/db/schema";
import { fmtDateTime, type Dict } from "@/lib/i18n";
import { caseAction } from "@/app/actions/admin";
import { Empty, Notice, Pill } from "@/components/ui";

export default async function Cases({ params, searchParams }: LP & { searchParams: Promise<Record<string, string | undefined>> }) {
  const { l, t } = await pageCtx(params);
  const sp = await searchParams;
  const rows = await db.query.cases.findMany({ with: { booking: true, openedBy: true }, orderBy: desc(cases.createdAt), limit: 100 });
  const open = rows.filter((c) => c.status !== "resolved").sort((a, b) => (a.priority === "urgent" ? -1 : 0) - (b.priority === "urgent" ? -1 : 0));
  const closed = rows.filter((c) => c.status === "resolved");
  return (
    <>
      <div><div className="eyebrow">{t.admin.title}</div><h1 className="font-display text-4xl font-semibold">{t.admin.nav.cases}</h1></div>
      {sp.error && <Notice tone="bad">{t.admin.needNote}</Notice>}
      {!open.length && <Empty title={t.common.noResults} />}
      {open.map((c) => (
        <div key={c.id} className={`card space-y-2 p-4 ${c.priority === "urgent" ? "border-bad/50" : ""}`}>
          <div className="flex flex-wrap items-center gap-2"><Pill tone={c.priority === "urgent" ? "bad" : "warn"}>{c.priority}</Pill><b>{t.trips.cats[c.category as keyof Dict["trips"]["cats"]] ?? c.category}</b>
            <span className="text-sm text-muted">{c.booking?.reference} · {c.openedBy.name} <span dir="ltr">{c.openedBy.phone}</span> · {fmtDateTime(c.createdAt, l)}</span>
            <Pill tone="info">{c.status}</Pill></div>
          <p className="whitespace-pre-line text-sm" dir="auto">{c.details}</p>
          <div className="flex flex-wrap gap-2">
            {c.status === "open" && <form action={caseAction}><input type="hidden" name="locale" value={l} /><input type="hidden" name="caseId" value={c.id} /><button name="op" value="assign" className="btn btn-sm">{t.admin.assign}</button></form>}
            <form action={caseAction} className="flex flex-1 gap-2"><input type="hidden" name="locale" value={l} /><input type="hidden" name="caseId" value={c.id} />
              <input name="resolution" className="input" placeholder={t.admin.resolution} aria-label={t.admin.resolution} /><button name="op" value="resolve" className="btn-ok btn-sm">{t.admin.resolve}</button></form>
          </div>
        </div>))}
      {closed.length > 0 && <details className="card p-4"><summary className="cursor-pointer text-sm font-semibold">{l === "ar" ? "البلاغات المغلقة" : "Resolved cases"} ({closed.length})</summary>
        <ul className="mt-2 space-y-1 text-sm">{closed.map((c) => <li key={c.id}>{c.booking?.reference} · {c.category} · <span className="text-muted">{c.resolution}</span></li>)}</ul></details>}
    </>
  );
}
