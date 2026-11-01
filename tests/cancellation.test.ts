import { describe, expect, it } from "vitest";
import { calcRefund, type Policy } from "@/lib/cancellation";
import { parseDay } from "@/lib/dates";

const booking = (policy: Policy, nights = 4, createdAt = "2026-10-01") => ({
  nights, baseAmount: nights * 100_000, cleaningFee: 20_000, guestFee: Math.round((nights * 100_000 + 20_000) * 0.07),
  total: nights * 100_000 + 20_000 + Math.round((nights * 100_000 + 20_000) * 0.07),
  checkIn: parseDay("2026-11-20"), checkOut: new Date(parseDay("2026-11-20").getTime() + nights * 86_400_000), createdAt: parseDay(createdAt), cancellationPolicy: policy,
});
const at = (s: string) => new Date(s);

describe("calcRefund", () => {
  it("refunds everything when the host cancels", () => {
    const b = booking("firm");
    expect(calcRefund(b, at("2026-11-19T10:00:00Z"), "host").refund).toBe(b.total);
  });
  it("refunds everything within 48 h of booking when check-in is 7+ days away", () => {
    const b = booking("firm", 4, "2026-11-01");
    expect(calcRefund(b, at("2026-11-02T12:00:00Z"), "guest").rule).toBe("grace_48h");
  });
  it("moderate: full refund 5+ days before", () => {
    expect(calcRefund(booking("moderate"), at("2026-11-14T00:00:00Z"), "guest").refund).toBe(booking("moderate").total);
  });
  it("moderate: keeps first night + half of the rest inside 5 days, refunds cleaning, keeps the fee", () => {
    const r = calcRefund(booking("moderate"), at("2026-11-18T00:00:00Z"), "guest");
    // kept = 100k + 50% of 300k = 250k; refund = 400k - 250k + 20k cleaning = 170k
    expect(r.refund).toBe(170_000);
    expect(r.feeRefunded).toBe(false);
  });
  it("flexible: full refund until 1 day before; then the first night is kept", () => {
    expect(calcRefund(booking("flexible"), at("2026-11-18T12:00:00Z"), "guest").rule).toBe("flexible_full");
    expect(calcRefund(booking("flexible"), at("2026-11-19T18:00:00Z"), "guest").refund).toBe(300_000 + 20_000);
  });
  it("firm: half between 7 and 30 days, nothing under 7 days", () => {
    expect(calcRefund(booking("firm"), at("2026-11-05T00:00:00Z"), "guest").refund).toBe(200_000 + 20_000);
    expect(calcRefund(booking("firm"), at("2026-11-16T00:00:00Z"), "guest").refund).toBe(20_000);
  });
  it("long stays keep the first 30 nights inside 30 days", () => {
    const b = { ...booking("flexible", 40), checkOut: parseDay("2026-12-30") };
    const r = calcRefund(b, at("2026-11-10T00:00:00Z"), "guest");
    expect(r.rule).toBe("long_first_30");
    expect(r.refund).toBe(10 * 100_000 + 20_000);
  });
});
