import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  createNotification,
  getCurrentUser,
  getProfile,
} from "./lib/helpers";
import { logSecurityEvent, SECURITY_EVENTS } from "./lib/security";

/**
 * À LA PIÈCE — admin & moderation backend.
 *
 * Deny by default: every read/write here first verifies the caller's role
 * (accountType `admin` or `moderator`). Roles are NEVER taken from the
 * request — they come from the server-side user row.
 */

async function requireAdminLike(
  ctx: QueryCtx,
): Promise<{ userId: Id<"users">; isModerator: boolean }> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.accountType !== "admin" && user.accountType !== "moderator") {
    // Unauthorized access attempt — the security journal lives in the DB so we
    // cannot write it from a query; the mutation endpoints log it instead.
    throw new Error("FORBIDDEN: espace réservé aux administrateurs.");
  }
  return { userId: user._id, isModerator: user.accountType === "moderator" };
}

// ---------------------------------------------------------------------------
// Security posture dashboard
// ---------------------------------------------------------------------------

/** Aggregated security posture — powers the admin dashboard checks panel. */
export const securityPosture = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminLike(ctx);

    const criticalEvents = await ctx.db
      .query("securityEvents")
      .withIndex("by_created", (q) => q.gte("createdAt", Date.now() - 7 * 86_400_000))
      .collect();
    const fraudPending = await ctx.db
      .query("fraudReviews")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const openReports = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .collect();
    const highPriority = openReports.filter((r) => r.priority === "high");
    const flaggedMessages = await ctx.db
      .query("securityEvents")
      .withIndex("by_type", (q) => q.eq("type", SECURITY_EVENTS.MESSAGE_FLAGGED))
      .order("desc")
      .take(20);

    return {
      critical7d: criticalEvents.filter((e) => e.severity === "critical").length,
      warning7d: criticalEvents.filter((e) => e.severity === "warning").length,
      fraudPending: fraudPending.length,
      openReports: openReports.length,
      highPriorityReports: highPriority.length,
      recentFlaggedMessages: flaggedMessages.map((e) => ({
        _id: e._id,
        createdAt: e.createdAt,
        details: e.details,
        userId: e.userId,
      })),
      recentEvents: criticalEvents
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30)
        .map((e) => ({
          _id: e._id,
          type: e.type,
          severity: e.severity,
          details: e.details,
          createdAt: e.createdAt,
        })),
    };
  },
});

// ---------------------------------------------------------------------------
// Anti-fraud review queue
// ---------------------------------------------------------------------------

/** Missions held by the anti-scam engine, with scan context. */
export const fraudQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminLike(ctx);
    const rows = await ctx.db
      .query("fraudReviews")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const result = [];
    for (const row of rows.sort((a, b) => b.score - a.score)) {
      const mission = await ctx.db.get(row.missionId);
      const publisherProfile = await getProfile(ctx, row.publisherId);
      result.push({
        _id: row._id,
        score: row.score,
        reasons: row.reasons,
        createdAt: row.createdAt,
        mission: mission
          ? {
              _id: mission._id,
              title: mission.title,
              description: mission.description,
              priceEuros: mission.priceEuros,
              status: mission.status,
              underReview: mission.underReview ?? false,
            }
          : null,
        publisher: publisherProfile?.firstName ?? "Compte supprimé",
      });
    }
    return result;
  },
});

/** Clear a flagged mission (false positive) → back to the marketplace. */
export const clearFraudReview = mutation({
  args: { reviewId: v.id("fraudReviews") },
  handler: async (ctx, args) => {
    const admin = await requireAdminLike(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.status !== "pending") throw new Error("NOT_FOUND");
    await ctx.db.patch(review._id, { status: "cleared" });
    const mission = await ctx.db.get(review.missionId);
    if (mission) {
      await ctx.db.patch(mission._id, { underReview: false });
      await createNotification(ctx, {
        userId: mission.publisherId,
        type: "mission",
        title: "Mission validée",
        body: `« ${mission.title} » a été vérifiée par notre équipe et est de nouveau visible.`,
        link: `/missions/${mission._id}`,
      });
    }
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.MISSION_APPROVED,
      severity: "info",
      userId: admin.userId,
      targetType: "mission",
      targetId: review.missionId,
      details: "Faux positif — mission remise en ligne par la modération.",
    });
  },
});

/** Confirm a scam: the mission is removed and the publisher is notified. */
export const confirmFraudReview = mutation({
  args: { reviewId: v.id("fraudReviews") },
  handler: async (ctx, args) => {
    const admin = await requireAdminLike(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.status !== "pending") throw new Error("NOT_FOUND");
    await ctx.db.patch(review._id, { status: "confirmed" });
    const mission = await ctx.db.get(review.missionId);
    if (mission) {
      await ctx.db.patch(mission._id, { status: "cancelled", underReview: true });
      await createNotification(ctx, {
        userId: mission.publisherId,
        type: "safety",
        title: "Mission retirée",
        body: `« ${mission.title} » ne respecte pas nos règles de sécurité. Elle a été retirée.`,
        link: "/securite",
      });
    }
    await logSecurityEvent(ctx, {
      type: "moderation.mission_removed",
      severity: "warning",
      userId: admin.userId,
      targetType: "mission",
      targetId: review.missionId,
      details: `Arnaque confirmée (score ${review.score}).`,
    });
  },
});

// ---------------------------------------------------------------------------
// Payout review queue (spec #43 §6 — held payouts)
// ---------------------------------------------------------------------------

/** Held payouts (anti-fraud gate) — oldest first for fairness. */
export const payoutQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminLike(ctx);
    const rows = await ctx.db
      .query("withdrawals")
      .withIndex("by_status", (q) => q.eq("status", "on_hold"))
      .collect();
    const result = [];
    for (const w of rows.sort((a, b) => a.requestedAt - b.requestedAt)) {
      const teenProfile = await getProfile(ctx, w.userId);
      result.push({
        _id: w._id,
        teenName: teenProfile?.firstName ?? "Adolescent",
        amountCents: w.amountCents,
        holdReason: w.holdReason ?? "Risque détecté",
        requestedAt: w.requestedAt,
      });
    }
    return result;
  },
});

// ---------------------------------------------------------------------------
// Reports moderation
// ---------------------------------------------------------------------------

/** Open reports, high priority first. Minimal necessary data only. */
export const reportQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminLike(ctx);
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .collect();
    const order = { high: 0, medium: 1, low: 2 } as const;
    return rows
      .sort((a, b) => order[a.priority] - order[b.priority] || b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((r) => ({
        _id: r._id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        description: r.description,
        priority: r.priority,
        createdAt: r.createdAt,
      }));
  },
});

/** Resolve (or reject) a report — moderator or admin. */
export const resolveReport = mutation({
  args: { reportId: v.id("reports"), status: v.union(v.literal("resolved"), v.literal("rejected")) },
  handler: async (ctx, args) => {
    const admin = await requireAdminLike(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("NOT_FOUND");
    await ctx.db.patch(report._id, { status: args.status });
    await logSecurityEvent(ctx, {
      type: "moderation.report_resolved",
      severity: "info",
      userId: admin.userId,
      targetType: "report",
      targetId: args.reportId,
      details: `Statut: ${args.status}.`,
    });
  },
});

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

/** Basic user search for moderation (name/email prefix). Minimal fields. */
export const searchUsers = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminLike(ctx);
    const needle = args.q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const users = await ctx.db.query("users").take(500);
    const matches = [];
    for (const u of users) {
      const profile = await getProfile(ctx, u._id);
      const hay = `${u.name ?? ""} ${u.email ?? ""} ${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.toLowerCase();
      if (hay.includes(needle)) {
        matches.push({
          userId: u._id,
          name: u.name ?? profile?.firstName ?? "Sans nom",
          email: u.email ? `${u.email.slice(0, 3)}***@${u.email.split("@")[1] ?? ""}` : null,
          accountType: u.accountType ?? null,
          status: profile?.status ?? "active",
        });
        if (matches.length >= (args.limit ?? 20)) break;
      }
    }
    return matches;
  },
});

/** Suspend / reactivate an account (admin only — moderators cannot). */
export const setUserStatus = mutation({
  args: {
    targetUserId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended"), v.literal("blocked")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminLike(ctx);
    if (admin.isModerator) {
      throw new Error("FORBIDDEN: seule l'administration peut suspendre un compte.");
    }
    if (args.targetUserId === admin.userId) {
      throw new Error("Un administrateur ne peut pas se suspendre lui-même.");
    }
    const profile = await getProfile(ctx, args.targetUserId);
    if (!profile) throw new Error("NOT_FOUND");
    await ctx.db.patch(profile._id, { status: args.status });
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.ACCOUNT_SUSPENDED,
      severity: "warning",
      userId: admin.userId,
      targetType: "user",
      targetId: args.targetUserId,
      details: `Nouveau statut: ${args.status}.`,
    });
    await createNotification(ctx, {
      userId: args.targetUserId,
      type: "safety",
      title: args.status === "active" ? "Compte réactivé" : "Compte suspendu",
      body:
        args.status === "active"
          ? "Ton compte est de nouveau actif. Bon retour !"
          : "Ton compte a été suspendu suite à un examen de modération. Contacte le support.",
      link: "/securite",
    });
    return { ok: true };
  },
});
