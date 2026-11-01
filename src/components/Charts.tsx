// Server-rendered SVG/HTML charts in brand colours. Values are plain numbers; formatting is passed in.
type Row = { label: string; v: number };

export function Bars({ rows, fmt, rows2, legend }: { rows: Row[]; fmt: (v: number) => string; rows2?: Row[]; legend?: [string, string] }) {
  if (!rows.length) return <p className="text-sm text-muted">—</p>;
  const max = Math.max(1, ...rows.map((r) => r.v), ...(rows2 ?? []).map((r) => r.v));
  return (
    <div>
      {legend && <Legend a={legend[0]} b={legend[1]} />}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.label + i} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-xs">
            <span className="truncate" title={r.label}>{r.label}</span>
            <div className="space-y-0.5">
              <div className="h-3 overflow-hidden rounded-sm bg-mist"><div className="h-full bg-gold-500" style={{ width: `${(r.v / max) * 100}%` }} /></div>
              {rows2 && <div className="h-3 overflow-hidden rounded-sm bg-mist"><div className="h-full bg-info" style={{ width: `${((rows2[i]?.v ?? 0) / max) * 100}%` }} /></div>}
            </div>
            <span className="num text-end">{fmt(r.v)}{rows2 && <span className="block text-muted">{fmt(rows2[i]?.v ?? 0)}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function niceMax(m: number) { const p = 10 ** Math.floor(Math.log10(Math.max(1, m))); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= m) return k * p; return m; }

export function Columns({ rows, fmt, rows2, legend }: { rows: Row[]; fmt: (v: number) => string; rows2?: Row[]; legend?: [string, string] }) {
  const W = 560, H = 210, pl = 56, pb = 26, pt = 10;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.v), ...(rows2 ?? []).map((r) => r.v)));
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl) / Math.max(1, rows.length);
  const cw = rows2 ? bw * 0.34 : bw * 0.6;
  return (
    <div dir="ltr">
      {legend && <Legend a={legend[0]} b={legend[1]} />}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => (
          <g key={f}><line x1={pl} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#DCE2EC" /><text x={pl - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="#4B5873">{fmt(max * f)}</text></g>
        ))}
        {rows.map((r, i) => {
          const x = pl + i * bw + (bw - (rows2 ? cw * 2 : cw)) / 2;
          return (
            <g key={r.label + i}>
              <rect x={x} y={y(r.v)} width={cw} height={Math.max(0, y(0) - y(r.v))} rx="2" fill="#C49A3C"><title>{`${r.label}: ${fmt(r.v)}`}</title></rect>
              {rows2 && <rect x={x + cw} y={y(rows2[i]?.v ?? 0)} width={cw} height={Math.max(0, y(0) - y(rows2[i]?.v ?? 0))} rx="2" fill="#2D5BA8"><title>{`${rows2[i]?.label}: ${fmt(rows2[i]?.v ?? 0)}`}</title></rect>}
              {(rows.length <= 12 || i % 2 === 0) && <text x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#4B5873">{r.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ a, b }: { a: string; b: string }) {
  return (
    <div className="mb-2 flex gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-gold-500" />{a}</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-info" />{b}</span>
    </div>
  );
}

export function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <div className="card min-w-0 p-5"><h3 className="text-sm font-semibold">{title}</h3>{sub && <p className="mb-3 text-xs text-muted">{sub}</p>}{children}</div>;
}
