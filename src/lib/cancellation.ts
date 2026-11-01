import { DAY } from "./dates";

export type Policy = "flexible" | "moderate" | "firm";

export type RefundCalc = {
  refund: number; // total returned to the guest
  keptByHost: number; // stay money the host keeps (before host fee)
  feeRefunded: boolean;
  rule: string; // machine key explaining which rule applied
};

type B = {
  nights: number;
  baseAmount: number;
  cleaningFee: number;
  guestFee: number;
  total: number;
  checkIn: Date;
  checkOut: Date;
  createdAt: Date;
  cancellationPolicy: Policy;
};

/**
 * Refund owed when a booking is cancelled at `at`.
 * - Host or Reliance cancels: everything is refunded.
 * - Guest cancels within 48 h of booking (and 7+ days before check-in): everything refunded.
 * - Stays of 28+ nights: full refund up to 30 days before check-in; after that the first 30 nights are kept.
 * - flexible: full up to 1 day before; after that the first night is kept (plus nights already stayed).
 * - moderate: full up to 5 days before; after that the first night + 50% of the remaining nights are kept.
 * - firm: full up to 30 days before; 7–30 days: 50% kept; under 7 days: everything kept.
 * Cleaning is refunded if the stay has not started. The 7% guest fee is refunded only in the full-refund cases above.
 */
export function calcRefund(b: B, at: Date, by: "guest" | "host" | "admin"): RefundCalc {
  const stay = b.baseAmount;
  const perNight = stay / b.nights;
  if (by !== "guest") return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "host_or_admin" };

  const daysBefore = (b.checkIn.getTime() - at.getTime()) / DAY;
  const started = at >= b.checkIn;
  const nightsStayed = started ? Math.min(b.nights, Math.ceil((at.getTime() - b.checkIn.getTime()) / DAY)) : 0;
  const within48h = at.getTime() - b.createdAt.getTime() <= 2 * DAY && daysBefore >= 7;
  if (within48h) return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "grace_48h" };

  let kept: number;
  let rule: string;
  if (b.nights >= 28) {
    if (daysBefore >= 30) return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "long_full" };
    kept = perNight * Math.min(b.nights, Math.max(30, nightsStayed));
    rule = "long_first_30";
  } else if (b.cancellationPolicy === "flexible") {
    if (daysBefore >= 1) return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "flexible_full" };
    kept = perNight * Math.max(1, nightsStayed + (started ? 1 : 0));
    rule = "flexible_first_night";
  } else if (b.cancellationPolicy === "moderate") {
    if (daysBefore >= 5) return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "moderate_full" };
    const firstOrStayed = Math.max(1, nightsStayed + (started ? 1 : 0));
    const remaining = Math.max(0, b.nights - firstOrStayed);
    kept = perNight * firstOrStayed + perNight * remaining * 0.5;
    rule = "moderate_partial";
  } else {
    if (daysBefore >= 30) return { refund: b.total, keptByHost: 0, feeRefunded: true, rule: "firm_full" };
    if (daysBefore >= 7) {
      kept = Math.max(stay * 0.5, perNight * nightsStayed);
      rule = "firm_half";
    } else {
      kept = stay;
      rule = "firm_none";
    }
  }
  kept = Math.min(stay, Math.round(kept));
  const cleaningBack = started ? 0 : b.cleaningFee;
  const keptCleaning = b.cleaningFee - cleaningBack;
  const refund = Math.max(0, stay - kept + cleaningBack);
  return { refund, keptByHost: kept + keptCleaning, feeRefunded: false, rule };
}
