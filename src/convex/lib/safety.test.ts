import { describe, expect, runTests, test } from "./testing";
import {
  ACCESS_META,
  CATEGORIES,
  canTeenApply,
  computeAge,
  computeFee,
  evaluateTeenAccess,
  getCategory,
  PLATFORM_FEE_RATE,
} from "./safety";

// ---------------------------------------------------------------------------
// computeAge
// ---------------------------------------------------------------------------
describe("computeAge", () => {
  test("returns exact age for a birth date", () => {
    // 2010-05-15 → 16 years old in 2026 (birthday passed).
    expect(computeAge("2010-05-15")).toBe(16);
  });

  test("does not count a birthday that has not happened yet this year", () => {
    const year = new Date().getFullYear() - 17;
    const now = new Date();
    const beforeBirthday =
      now.getMonth() < 11 || (now.getMonth() === 11 && now.getDate() < 31);
    expect(computeAge(`${year}-12-31`)).toBe(beforeBirthday ? 16 : 17);
  });

  test("returns null for missing or invalid input", () => {
    expect(computeAge(null)).toBeNull();
    expect(computeAge(undefined)).toBeNull();
    expect(computeAge("")).toBeNull();
    expect(computeAge("not-a-date")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateTeenAccess — the safety engine's core rules
// ---------------------------------------------------------------------------
function mission(overrides: Partial<Parameters<typeof evaluateTeenAccess>[0]> = {}) {
  return {
    categorySlug: "animaux",
    riskLevel: "low" as const,
    scheduledDate: "2026-06-06",
    scheduledTime: "10:00",
    durationMin: 60,
    ...overrides,
  };
}

describe("evaluateTeenAccess", () => {
  test("high-risk categories are open to 12–17 but flagged for parental vigilance", () => {
    for (const slug of ["babysitting", "bricolage", "livraison"]) {
      const access = evaluateTeenAccess(mission({ categorySlug: slug }), 15);
      expect(access.level).not.toBe("adults_only");
      expect(access.reasons.some((r) => r.includes("risque élevé"))).toBe(true);
    }
  });

  test("explicit high riskLevel adds the parental-vigilance reason, never blocks", () => {
    const access = evaluateTeenAccess(mission({ riskLevel: "high" }), 15);
    expect(access.level).not.toBe("adults_only");
    expect(access.reasons.some((r) => r.includes("supervision parentale"))).toBe(true);
  });

  test("unverified age always requires parental approval (never auto-allowed)", () => {
    const access = evaluateTeenAccess(mission(), null);
    expect(access.level).toBe("parental_approval");
    expect(access.reasons.length).toBeGreaterThan(0);
  });

  test("adults are always allowed", () => {
    expect(evaluateTeenAccess(mission(), 18).level).toBe("allowed");
    expect(evaluateTeenAccess(mission(), 25).level).toBe("allowed");
  });

  test("typical teen mission (12 y/o, daytime, low risk) is allowed", () => {
    expect(evaluateTeenAccess(mission({ scheduledTime: "14:00" }), 12).level).toBe("allowed");
  });

  test("12–13: mission ending after 20:00 requires parental approval", () => {
    // 19:45 + 60 min → ends 20:45.
    const access = evaluateTeenAccess(mission({ scheduledTime: "19:45" }), 13);
    expect(access.level).toBe("parental_approval");
    expect(access.reasons.some((r) => r.includes("20h00"))).toBe(true);
  });

  test("14–17: mission ending after 22:00 requires parental approval", () => {
    // 21:30 + 60 min → ends 22:30.
    const access = evaluateTeenAccess(mission({ scheduledTime: "21:30" }), 16);
    expect(access.level).toBe("parental_approval");
    expect(access.reasons.some((r) => r.includes("22h00"))).toBe(true);
  });

  test("duration above the category cap raises a reason", () => {
    // animaux caps minors at 120 min.
    const access = evaluateTeenAccess(mission({ durationMin: 150 }), 15);
    expect(access.reasons.some((r) => r.includes("120 min"))).toBe(true);
    expect(access.level).toBe("parental_approval");
  });

  test("boundary: exactly 20:00 end for under-14 stays allowed", () => {
    // 19:00 + 60 min → ends 20:00 sharp, not after.
    expect(evaluateTeenAccess(mission({ scheduledTime: "19:00" }), 13).level).toBe("allowed");
  });
});

// ---------------------------------------------------------------------------
// canTeenApply — access level → decision
// ---------------------------------------------------------------------------
describe("canTeenApply", () => {
  test("allowed passes without parental approval", () => {
    expect(canTeenApply({ level: "allowed", reasons: [] }, false)).toBe(true);
  });

  test("parental_approval requires the approval", () => {
    expect(canTeenApply({ level: "parental_approval", reasons: [] }, false)).toBe(false);
    expect(canTeenApply({ level: "parental_approval", reasons: [] }, true)).toBe(true);
  });

  test("adults_only and forbidden always fail, even with approval", () => {
    expect(canTeenApply({ level: "adults_only", reasons: [] }, true)).toBe(false);
    expect(canTeenApply({ level: "forbidden", reasons: [] }, true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Platform fee
// ---------------------------------------------------------------------------
describe("computeFee", () => {
  test("applies a 10% platform fee, rounded to cents", () => {
    expect(computeFee(15)).toBe(1.5);
    expect(computeFee(20)).toBe(2);
    expect(computeFee(9.99)).toBeCloseTo(1, 2); // 0.999 → 1.00
  });

  test("fee rate constant matches the 10% rule", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// Category catalogue invariants
// ---------------------------------------------------------------------------
describe("category catalogue", () => {
  test("every category is reachable via getCategory", () => {
    for (const c of CATEGORIES) {
      expect(getCategory(c.slug)).toBeDefined();
    }
  });

  test("every access level has display metadata", () => {
    for (const key of Object.keys(ACCESS_META)) {
      expect(ACCESS_META[key as keyof typeof ACCESS_META].label).toBeTruthy();
    }
  });
});

await runTests("src/convex/lib/safety.test.ts");
