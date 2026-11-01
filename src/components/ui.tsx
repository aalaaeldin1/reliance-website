import type { ReactNode } from "react";

const TONE = { ok: "bg-ok/10 text-ok", warn: "bg-gold-500/20 text-warn", bad: "bg-bad/10 text-bad", info: "bg-info/10 text-info", mute: "bg-mist text-muted" } as const;
export type Tone = keyof typeof TONE;

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${TONE[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>;
}

export const BOOKING_TONE: Record<string, Tone> = {
  requested: "warn", awaiting_payment: "warn", payment_review: "info", confirmed: "ok", in_stay: "ok", completed: "mute", declined: "bad", expired: "mute", cancelled: "bad",
};
export const LISTING_TONE: Record<string, Tone> = { draft: "mute", pending: "warn", changes_requested: "info", live: "ok", paused: "mute", suspended: "bad", rejected: "bad" };

export function Stat({ k, v, s, alert }: { k: string; v: ReactNode; s?: ReactNode; alert?: boolean }) {
  return (
    <div className={`card min-w-0 p-4 ${alert ? "border-gold-500/60 bg-gradient-to-b from-gold-500/10 to-white" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</div>
      <div className="num mt-1 font-display text-3xl font-semibold leading-tight">{v}</div>
      {s && <div className="mt-0.5 text-xs text-muted">{s}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-4 pt-8">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="font-display text-4xl font-semibold">{title}</h1></div>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gold-500/50 p-8 text-center text-muted">
      <h3 className="mb-1 font-display text-2xl font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-lg px-4 py-3 text-sm ${TONE[tone]}`} role="status">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full border-collapse">{children}</table></div>;
}
