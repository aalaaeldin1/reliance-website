// All money is integer piastres. 1 EGP = 100 piastres.
export const toPiastres = (egp: number) => Math.round(egp * 100);
export const toEgp = (p: number) => p / 100;

export function fmtEgp(p: number, locale: "en" | "ar" = "en", opts: { decimals?: boolean } = {}) {
  const v = p / 100;
  const n = v.toLocaleString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
  return locale === "ar" ? `${n} ج.م` : `E£${n}`;
}

export function fmtCompact(p: number, locale: "en" | "ar" = "en") {
  const v = p / 100;
  if (v >= 1_000_000) return (locale === "ar" ? "" : "E£") + (v / 1_000_000).toFixed(2) + (locale === "ar" ? " مليون ج.م" : "M");
  if (v >= 10_000) return (locale === "ar" ? "" : "E£") + Math.round(v / 1000) + (locale === "ar" ? " ألف ج.م" : "K");
  return fmtEgp(p, locale);
}
