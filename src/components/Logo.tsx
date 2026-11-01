export function Logo({ sub, light = true }: { sub?: string; light?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-none" dir="ltr">
      <span className={`font-display text-[26px] font-semibold tracking-[0.06em] ${light ? "text-mist" : "text-navy-900"}`}>
        <span className="text-[31px] text-gold-500">R</span>ELIANCE
      </span>
      {sub && <span className="mt-1 ps-0.5 text-[8.5px] tracking-[0.34em] text-gold-400">{sub}</span>}
    </span>
  );
}
