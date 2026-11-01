// Placeholder artwork for homes without photos (in brand colours, themed by area).
function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const THEME: Record<string, "nile" | "pyramids" | "compound" | "city"> = {
  zamalek: "nile", "garden-city": "nile", maadi: "nile", pyramids: "pyramids", "new-cairo": "compound", "sheikh-zayed": "compound", october: "compound",
};
export function PropertyArt({ seed, areaId, label }: { seed: string; areaId: string; label: string }) {
  const r = hash(seed), th = THEME[areaId] ?? "city";
  const sky = [["#06101F", "#152D56"], ["#0B1A30", "#1A3870"], ["#0F2244", "#C49A3C"], ["#06101F", "#96771E"]][r % 4];
  const sx = 60 + ((r % 1000) / 1000) * 280, sy = 60 + (((r >>> 10) % 1000) / 1000) * 60;
  const blocks = Array.from({ length: 10 }, (_, i) => ({ x: i * 40 + ((r >>> i) % 8), w: 26 + ((r >>> i) % 12), h: 50 + ((r >>> (i + 3)) % 110) }));
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img" aria-label={label}>
      <defs><linearGradient id={`g${r}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky[0]} /><stop offset="1" stopColor={sky[1]} /></linearGradient></defs>
      <rect width="400" height="300" fill={`url(#g${r})`} />
      <circle cx={sx} cy={sy} r="26" fill="#E8D28C" opacity=".85" /><circle cx={sx} cy={sy} r="48" fill="#E8D28C" opacity=".12" />
      {th === "pyramids" ? (<>
        <path d="M40 250 L150 120 L260 250Z" fill="#C49A3C" /><path d="M150 120 L260 250 L190 250Z" fill="#96771E" />
        <path d="M230 250 L300 165 L370 250Z" fill="#D4AE54" /><path d="M300 165 L370 250 L330 250Z" fill="#96771E" />
        <rect y="248" width="400" height="52" fill="#0B1A30" /></>
      ) : th === "compound" ? (<>
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 + i * 78} y={240 - blocks[i].h * 0.7} width="64" height={blocks[i].h * 0.7} fill="#0B1A30" stroke="#C49A3C" strokeOpacity=".35" />)}
        <rect y="240" width="400" height="60" fill="#0F2244" /></>
      ) : (<>
        {blocks.map((b, i) => <rect key={i} x={b.x} y={(th === "nile" ? 215 : 250) - b.h} width={b.w} height={b.h} fill={i % 2 ? "#0B1A30" : "#0F2244"} />)}
        {blocks.map((b, i) => ((r >>> i) & 3) === 1 ? <rect key={"w" + i} x={b.x + 6} y={(th === "nile" ? 222 : 258) - b.h} width="5" height="6" fill="#E8D28C" /> : null)}
        {th === "nile" ? <><rect y="214" width="400" height="86" fill="#152D56" /><path d="M0 236 Q100 226 200 238 T400 234" stroke="#C49A3C" strokeWidth="2" fill="none" opacity=".7" /></> : <rect y="250" width="400" height="50" fill="#06101F" />}
      </>)}
    </svg>
  );
}
