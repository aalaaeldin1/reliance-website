import { eachNight, isWeekendNight, dayStr } from "./dates";

export type Rate = {
  nightly: number;
  weekend?: number | null;
  weeklyDiscount?: number;
  monthly?: number | null;
  cleaningFee?: number;
  minNights?: number;
  maxNights?: number;
};

export type Quote = {
  nights: number;
  nightsTotal: number; // sum of nightly prices before discounts
  baseAmount: number; // after weekly/monthly pricing
  cleaningFee: number;
  guestFee: number;
  hostFee: number;
  total: number; // what the guest pays
  hostPayout: number; // what the host receives
  note: "monthly" | "weekly" | null;
};

/**
 * Price a stay. overrides maps "YYYY-MM-DD" -> nightly price for that night.
 * Rules: weekend price on Thu/Fri nights; 7+ nights get the weekly discount;
 * 28+ nights use the monthly price (per 30 nights) when it is cheaper.
 * Guest fee and host fee are charged on stay + cleaning.
 */
export function quoteStay(
  rate: Rate,
  checkIn: Date,
  checkOut: Date,
  fees: { guestBps: number; hostBps: number },
  overrides: Record<string, number> = {},
): Quote {
  const nights = eachNight(checkIn, checkOut);
  if (nights.length < 1) throw new Error("Stay must be at least one night");
  const nightsTotal = nights.reduce((sum, d) => {
    const o = overrides[dayStr(d)];
    if (o != null) return sum + o;
    return sum + (isWeekendNight(d) && rate.weekend ? rate.weekend : rate.nightly);
  }, 0);
  let baseAmount = nightsTotal;
  let note: Quote["note"] = null;
  if (nights.length >= 28 && rate.monthly) {
    const monthlyPrice = Math.round((rate.monthly / 30) * nights.length);
    if (monthlyPrice < baseAmount) {
      baseAmount = monthlyPrice;
      note = "monthly";
    }
  }
  if (!note && nights.length >= 7 && rate.weeklyDiscount) {
    baseAmount = Math.round(nightsTotal * (1 - rate.weeklyDiscount / 100));
    note = "weekly";
  }
  const cleaningFee = rate.cleaningFee ?? 0;
  const sub = baseAmount + cleaningFee;
  const guestFee = Math.round((sub * fees.guestBps) / 10_000);
  const hostFee = Math.round((sub * fees.hostBps) / 10_000);
  return {
    nights: nights.length,
    nightsTotal,
    baseAmount,
    cleaningFee,
    guestFee,
    hostFee,
    total: sub + guestFee,
    hostPayout: sub - hostFee,
    note,
  };
}

/** Median of a list of numbers (0 for empty). */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export type Fairness = { kind: "good" | "fair" | "premium"; diffPct: number; peer: number; peerCount: number };

/** Compare a nightly price with the median of similar homes (±1 bedroom). */
export function fairness(nightly: number, peers: number[], fallback: number): Fairness {
  const peer = peers.length ? median(peers) : fallback;
  const diff = (nightly - peer) / peer;
  return {
    kind: diff <= -0.1 ? "good" : diff < 0.1 ? "fair" : "premium",
    diffPct: Math.round(diff * 100),
    peer,
    peerCount: peers.length,
  };
}

/** Airbnb ADR benchmarks (AirROI, 12 months to Sep 2026), in piastres. */
export const BENCHMARK_ADR: Record<string, number> = { Cairo: 333_300, Giza: 324_800 };
export function suggestedNightly(governorate: string, bedrooms: number, peers: number[]) {
  if (peers.length) return Math.round(median(peers) / 5000) * 5000;
  const adr = BENCHMARK_ADR[governorate] ?? BENCHMARK_ADR.Cairo;
  return Math.round((adr * (0.75 + bedrooms * 0.18)) / 5000) * 5000;
}
