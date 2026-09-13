import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * À LA PIÈCE — Gamification engine (XP, niveaux, badges).
 *
 * Everything is derived from real completed missions and reviews — never
 * simulated. XP is a virtual reward system fully separated from real money.
 * Nothing here can bypass the safety engine: XP is earned only for missions
 * that actually completed through the booking flow.
 */

// ---------------------------------------------------------------------------
// Levels (5 tiers for now, extensible)
// ---------------------------------------------------------------------------
export const LEVELS = [
  { number: 1, title: "Débutant", minXp: 0, unlock: "Avatar standard" },
  { number: 2, title: "Régulier", minXp: 100, unlock: "Badge « 1re mission »" },
  { number: 3, title: "Confirmé", minXp: 300, unlock: "Cadre argenté" },
  { number: 4, title: "Expert", minXp: 600, unlock: "Cadre doré" },
  { number: 5, title: "Élite", minXp: 1000, unlock: "Titre « Élite »" },
] as const;

export function levelForXp(xp: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXp) current = l;
  }
  const next = LEVELS.find((l) => l.minXp > current.minXp) ?? null;
  const rangeStart = current.minXp;
  const rangeEnd = next ? next.minXp : current.minXp;
  const pct = next
    ? Math.min(100, Math.round(((xp - rangeStart) / (rangeEnd - rangeStart)) * 100))
    : 100;
  return { ...current, next, rangeStart, rangeEnd, pct };
}

// ---------------------------------------------------------------------------
// Badges — earned from real milestones (all-zero = locked, never granted by default)
// ---------------------------------------------------------------------------
export interface BadgeDef {
  id: string;
  /** Pictogram name resolved client-side via the icon registry. */
  icon: string;
  label: string;
  description: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

export const BADGES: (BadgeDef & { check: (s: BadgeStats) => boolean })[] = [
  { id: "first_mission", icon: "medal", label: "Première mission", description: "Termine ta 1re mission", rarity: "common", check: (s) => s.completed >= 1 },
  { id: "five_missions", icon: "flame", label: "5 missions", description: "Termine 5 missions", rarity: "common", check: (s) => s.completed >= 5 },
  { id: "ten_missions", icon: "trophy", label: "10 missions", description: "Termine 10 missions", rarity: "rare", check: (s) => s.completed >= 10 },
  { id: "five_stars", icon: "star", label: "5 étoiles", description: "Reçois une note parfaite", rarity: "rare", check: (s) => (s.bestRating ?? 0) >= 5 },
  { id: "high_rating", icon: "sparkles", label: "Excellente note", description: "Note moyenne ≥ 4,5 (3 avis min.)", rarity: "epic", check: (s) => s.reviewCount >= 3 && (s.averageRating ?? 0) >= 4.5 },
  { id: "quick_hero", icon: "zap", label: "Mission rapide", description: "Remporte une mission rapide", rarity: "common", check: (s) => s.quickWins >= 1 },
  { id: "animaux", icon: "dog", label: "Expert animaux", description: "3 missions Animaux", rarity: "rare", check: (s) => (s.byCategory["animaux"] ?? 0) >= 3 },
  { id: "jardinage", icon: "sprout", label: "Main verte", description: "3 missions Jardinage", rarity: "rare", check: (s) => (s.byCategory["jardinage"] ?? 0) >= 3 },
  { id: "tech", icon: "laptop", label: "Tech", description: "3 missions Informatique", rarity: "rare", check: (s) => (s.byCategory["informatique"] ?? 0) >= 3 },
  { id: "punctual", icon: "clock", label: "Ponctuel", description: "Ponctualité 5/5 reçue", rarity: "common", check: (s) => (s.bestPunctuality ?? 0) >= 5 },
  { id: "reliable", icon: "target", label: "Fiable", description: "Fiabilité 5/5 reçue", rarity: "common", check: (s) => (s.bestReliability ?? 0) >= 5 },
  { id: "marathon", icon: "dumbbell", label: "Endurance", description: "20 missions terminées", rarity: "epic", check: (s) => s.completed >= 20 },
];

export interface BadgeStats {
  completed: number;
  quickWins: number;
  byCategory: Record<string, number>;
  averageRating: number | null;
  reviewCount: number;
  bestRating: number | null;
  bestPunctuality: number | null;
  bestReliability: number | null;
}

// ---------------------------------------------------------------------------
// XP amounts per real event
// ---------------------------------------------------------------------------
export const XP_RULES = {
  missionCompleted: 100,
  fiveStarReview: 20,
  quickMissionBonus: 50,
  perLevelUp: 0,
} as const;

/** Compute full gamification state for a teen from their real booking/review history. */
export async function teenGamification(ctx: QueryCtx, teenUserId: Id<"users">) {
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_teen", (q) => q.eq("teenId", teenUserId))
    .collect();

  const completedBookings = bookings.filter((b) => b.status === "completed");
  const completed = completedBookings.length;

  const byCategory: Record<string, number> = {};
  let quickWins = 0;
  for (const b of completedBookings) {
    const mission = await ctx.db.get(b.missionId);
    if (mission) {
      byCategory[mission.categorySlug] = (byCategory[mission.categorySlug] ?? 0) + 1;
      if ((mission.missionType ?? "verified") === "quick") quickWins += 1;
    }
  }

  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_target", (q) => q.eq("targetUserId", teenUserId))
    .collect();

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
      : null;
  const bestRating = reviewCount > 0 ? Math.max(...reviews.map((r) => r.rating)) : null;
  const bestPunctuality = reviewCount > 0 ? Math.max(...reviews.map((r) => r.punctuality ?? 0)) : null;
  const bestReliability = reviewCount > 0 ? Math.max(...reviews.map((r) => r.reliability ?? 0)) : null;

  const stats: BadgeStats = {
    completed,
    quickWins,
    byCategory,
    averageRating,
    reviewCount,
    bestRating,
    bestPunctuality,
    bestReliability,
  };

  const badges = BADGES.filter((b) => b.check(stats)).map(({ check: _check, ...rest }) => rest);
  const lockedBadges = BADGES.filter((b) => !b.check(stats)).map(({ check: _check, ...rest }) => rest);

  // XP: 100 per completed mission, +50 quick bonus, +20 per five-star review.
  const fiveStars = reviews.filter((r) => r.rating >= 5).length;
  const xp =
    completed * XP_RULES.missionCompleted +
    quickWins * XP_RULES.quickMissionBonus +
    fiveStars * XP_RULES.fiveStarReview;

  const level = levelForXp(xp);

  return {
    xp,
    level: { number: level.number, title: level.title, pct: level.pct, next: level.next ? { number: level.next.number, title: level.next.title, minXp: level.next.minXp } : null, rangeStart: level.rangeStart, rangeEnd: level.rangeEnd },
    badges,
    lockedBadges,
    stats: { completed, quickWins, reviewCount, averageRating },
  };
}

// Re-exported types for client consumption
export type GamificationResult = Awaited<ReturnType<typeof teenGamification>>;
