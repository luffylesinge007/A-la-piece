import { describe, expect, runTests, test } from "./lib/testing";
import { evaluatePayoutRisk } from "./lib/payoutRisk";

describe("evaluatePayoutRisk", () => {
  test("a normal small payout is not held", () => {
    const r = evaluatePayoutRisk({
      amountCents: 6500,
      recentFailedPayouts: 0,
      accountCountry: "FR",
    });
    expect(r.hold).toBe(false);
    expect(r.reasons.length).toBe(0);
  });

  test("a large amount (>= 300 €) triggers a hold", () => {
    const r = evaluatePayoutRisk({ amountCents: 300_00, recentFailedPayouts: 0 });
    expect(r.hold).toBe(true);
    expect(r.reasons[0]).toContain("300");
  });

  test("a bank account changed less than 24h ago is held", () => {
    const r = evaluatePayoutRisk({
      amountCents: 2000,
      bankAccountChangedAt: Date.now() - 3600_000,
      recentFailedPayouts: 0,
    });
    expect(r.hold).toBe(true);
    expect(r.reasons[0]).toContain("24 h");
  });

  test("an old bank account change does not trigger a hold", () => {
    const r = evaluatePayoutRisk({
      amountCents: 2000,
      bankAccountChangedAt: Date.now() - 72 * 3600_000,
      recentFailedPayouts: 0,
    });
    expect(r.hold).toBe(false);
  });

  test("two recent failures hold the payout", () => {
    const r = evaluatePayoutRisk({ amountCents: 2000, recentFailedPayouts: 2 });
    expect(r.hold).toBe(true);
    expect(r.reasons.some((x) => x.includes("2 échecs"))).toBe(true);
  });

  test("one recent failure only raises the score", () => {
    const r = evaluatePayoutRisk({ amountCents: 2000, recentFailedPayouts: 1 });
    expect(r.hold).toBe(false);
    expect(r.score).toBeGreaterThan(0);
  });

  test("an unsupported country raises the score but not alone a hold", () => {
    const r = evaluatePayoutRisk({ amountCents: 2000, accountCountry: "US", recentFailedPayouts: 0 });
    expect(r.hold).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  test("score is capped at 100", () => {
    const r = evaluatePayoutRisk({
      amountCents: 500_00,
      bankAccountChangedAt: Date.now(),
      recentFailedPayouts: 5,
      accountCountry: "ZZ",
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.hold).toBe(true);
  });
});

runTests();
