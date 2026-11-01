import { describe, expect, it } from "vitest";
import { quoteStay, fairness, median, suggestedNightly } from "@/lib/pricing";
import { parseDay } from "@/lib/dates";

const fees = { guestBps: 700, hostBps: 500 };
const rate = { nightly: 300_000, weekend: 360_000, weeklyDiscount: 10, monthly: 7_000_000, cleaningFee: 20_000 };

describe("quoteStay", () => {
  it("uses the weekend price on Thursday and Friday nights", () => {
    // 2026-11-05 is a Thursday: Thu + Fri nights
    const q = quoteStay(rate, parseDay("2026-11-05"), parseDay("2026-11-07"), fees);
    expect(q.nightsTotal).toBe(720_000);
    expect(q.note).toBeNull();
  });
  it("charges 7% to the guest and 5% to the host on stay + cleaning", () => {
    const q = quoteStay({ nightly: 100_000 }, parseDay("2026-11-02"), parseDay("2026-11-04"), fees);
    expect(q.baseAmount).toBe(200_000);
    expect(q.guestFee).toBe(14_000);
    expect(q.hostFee).toBe(10_000);
    expect(q.total).toBe(214_000);
    expect(q.hostPayout).toBe(190_000);
  });
  it("applies the weekly discount from 7 nights", () => {
    const q = quoteStay({ nightly: 100_000, weeklyDiscount: 10 }, parseDay("2026-11-02"), parseDay("2026-11-09"), fees);
    expect(q.baseAmount).toBe(630_000);
    expect(q.note).toBe("weekly");
  });
  it("uses the monthly price from 28 nights when cheaper", () => {
    const q = quoteStay(rate, parseDay("2026-11-01"), parseDay("2026-12-01"), fees);
    expect(q.nights).toBe(30);
    expect(q.baseAmount).toBe(7_000_000);
    expect(q.note).toBe("monthly");
  });
  it("respects per-night overrides", () => {
    const q = quoteStay({ nightly: 100_000 }, parseDay("2026-11-02"), parseDay("2026-11-04"), fees, { "2026-11-03": 150_000 });
    expect(q.nightsTotal).toBe(250_000);
  });
  it("rejects zero-night stays", () => {
    expect(() => quoteStay(rate, parseDay("2026-11-02"), parseDay("2026-11-02"), fees)).toThrow();
  });
});

describe("fairness and suggestions", () => {
  it("computes the median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
  });
  it("labels value, fair and premium prices", () => {
    expect(fairness(80, [100, 100, 100], 1).kind).toBe("good");
    expect(fairness(105, [100], 1).kind).toBe("fair");
    expect(fairness(130, [100], 1).kind).toBe("premium");
    expect(fairness(100, [], 100).peerCount).toBe(0);
  });
  it("suggests from peers, else from the Airbnb benchmark", () => {
    expect(suggestedNightly("Cairo", 2, [300_000, 400_000])).toBe(350_000);
    expect(suggestedNightly("Giza", 2, [])).toBeGreaterThan(0);
  });
});
