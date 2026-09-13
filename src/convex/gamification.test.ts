import { describe, expect, runTests, test } from "./lib/testing";
import { BADGES, LEVELS, levelForXp, type BadgeStats } from "./gamification";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const zero: BadgeStats = {
  completed: 0,
  quickWins: 0,
  byCategory: {},
  averageRating: null,
  reviewCount: 0,
  bestRating: null,
  bestPunctuality: null,
  bestReliability: null,
};

const beginner: BadgeStats = {
  ...zero,
  completed: 1,
  byCategory: { animaux: 1 },
};

const perfect: BadgeStats = {
  ...zero,
  completed: 1,
  quickWins: 1,
  byCategory: { animaux: 1 },
  averageRating: 5,
  reviewCount: 1,
  bestRating: 5,
  bestPunctuality: 5,
  bestReliability: 5,
};

const veteran: BadgeStats = {
  completed: 10,
  quickWins: 2,
  byCategory: { animaux: 3, jardinage: 4, informatique: 3 },
  averageRating: 4.7,
  reviewCount: 9,
  bestRating: 5,
  bestPunctuality: 5,
  bestReliability: 5,
};

const unlocked = (s: BadgeStats) => BADGES.filter((b) => b.check(s)).map((b) => b.id);

// ---------------------------------------------------------------------------
// levelForXp
// ---------------------------------------------------------------------------
describe("levelForXp", () => {
  test("level thresholds are strictly increasing and start at 0", () => {
    expect(LEVELS[0].minXp).toBe(0);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].minXp).toBeGreaterThan(LEVELS[i - 1].minXp);
    }
  });

  test("0 XP → level 1 Débutant with a reachable next level", () => {
    const l = levelForXp(0);
    expect(l.number).toBe(1);
    expect(l.title).toBe("Débutant");
    expect(l.next?.number).toBe(2);
    expect(l.pct).toBe(0);
  });

  test("known thresholds resolve to the right titles", () => {
    expect(levelForXp(99).number).toBe(1);
    expect(levelForXp(100).number).toBe(2);
    expect(levelForXp(299).number).toBe(2);
    expect(levelForXp(300).number).toBe(3);
    expect(levelForXp(600).title).toBe("Expert");
    expect(levelForXp(1000).title).toBe("Élite");
  });

  test("max level reports 100% and no next level", () => {
    const l = levelForXp(999_999);
    expect(l.title).toBe("Élite");
    expect(l.next).toBeNull();
    expect(l.pct).toBe(100);
  });

  test("progress percentage is monotonic and capped within a level range", () => {
    const a = levelForXp(150).pct;
    const b = levelForXp(250).pct;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(levelForXp(250).pct).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// badges
// ---------------------------------------------------------------------------
describe("badges", () => {
  test("badge ids are unique and every badge has display fields", () => {
    const ids = new Set(BADGES.map((b) => b.id));
    expect(ids.size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(b.label).toBeTruthy();
      expect(b.description).toBeTruthy();
      expect(b.icon).toBeTruthy();
      expect(["common", "rare", "epic", "legendary"]).toContain(b.rarity);
    }
  });

  test("zero stats unlock nothing (all-zero = locked, never granted by default)", () => {
    expect(unlocked(zero)).toEqual([]);
  });

  test("first completed mission unlocks exactly the first-mission badge", () => {
    expect(unlocked(beginner)).toEqual(["first_mission"]);
  });

  test("a perfect quick mission unlocks the quick + review badges", () => {
    const ids = unlocked(perfect);
    expect(ids).toContain("first_mission");
    expect(ids).toContain("quick_hero");
    expect(ids).toContain("five_stars");
    expect(ids).toContain("punctual");
    expect(ids).toContain("reliable");
  });

  test("veteran unlocks milestone, category-expert and rating badges", () => {
    const ids = unlocked(veteran);
    expect(ids).toContain("first_mission");
    expect(ids).toContain("five_missions");
    expect(ids).toContain("ten_missions");
    expect(ids).toContain("animaux"); // 3 in animaux
    expect(ids).toContain("jardinage"); // 4 in jardinage
    expect(ids).toContain("tech"); // 3 in informatique
    expect(ids).toContain("high_rating"); // 4.7 avg over 9 reviews
    expect(ids).not.toContain("marathon"); // 10 < 20
  });

  test("category-expert badges require 3 missions in that exact category", () => {
    const s: BadgeStats = { ...beginner, byCategory: { animaux: 2 } };
    expect(BADGES.find((b) => b.id === "animaux")!.check(s)).toBe(false);
    s.byCategory = { animaux: 3 };
    expect(BADGES.find((b) => b.id === "animaux")!.check(s)).toBe(true);
  });
});

await runTests("src/convex/gamification.test.ts");
