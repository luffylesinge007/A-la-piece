import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  effectiveAge,
  getCurrentUser,
  getProfile,
  hasApprovedParent,
  isAdultAccount,
  requireUser,
} from "./lib/helpers";
import { evaluateTeenAccess, canTeenApply, getCategory } from "./lib/safety";
import { scanMission } from "./lib/fraud";
import {
  consumeRateLimit,
  logSecurityEvent,
  requireActiveAccount,
  sanitizeText,
  SECURITY_EVENTS,
} from "./lib/security";
import type { Id } from "./_generated/dataModel";

/** Public shape of a mission as seen in lists — no exact address. */
function publicMission(doc: any, viewerAge: number | null, viewerHasParent: boolean, viewerId?: Id<"users">) {
  const access = evaluateTeenAccess(doc, viewerAge);
  const missionType = doc.missionType ?? "verified";
  const maxApplicants = doc.maxApplicants ?? 5;
  // A verified mission is full when the application cap is reached.
  const appsFull = missionType === "verified" && (doc.applicantCount ?? 0) >= maxApplicants;
  // A quick mission is claimable only while still published.
  const claimable = missionType === "quick" && doc.status === "published";
  return {
    _id: doc._id,
    title: doc.title,
    description: doc.description,
    categorySlug: doc.categorySlug,
    category: getCategory(doc.categorySlug),
    priceEuros: doc.priceEuros,
    durationMin: doc.durationMin,
    scheduledDate: doc.scheduledDate,
    scheduledTime: doc.scheduledTime,
    city: doc.city,
    area: doc.area, // approximate zone only
    status: doc.status,
    riskLevel: doc.riskLevel,
    missionType,
    maxApplicants,
    appsFull,
    claimable: claimable && doc.publisherId !== viewerId,
    claimedBy: doc.claimedBy ?? null,
    requiredSkills: doc.requiredSkills ?? [],
    equipment: doc.equipment,
    safetyNotes: doc.safetyNotes,
    teamSize: doc.teamSize,
    requiresPin: doc.requiresPin ?? false,
    applicantCount: doc.applicantCount ?? 0,
    publisherId: doc.publisherId,
    createdAt: doc.createdAt,
    access,
    canApply:
      doc.publisherId !== viewerId &&
      missionType === "verified" &&
      !appsFull &&
      canTeenApply(access, viewerHasParent),
    isMine: doc.publisherId === viewerId,
  };
}

/** Browse published missions. Adults see everything; teens see safety-filtered data. */
export const listMissions = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    maxDuration: v.optional(v.number()),
    city: v.optional(v.string()),
    missionType: v.optional(v.union(v.literal("quick"), v.literal("verified"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    let viewerAge: number | null = null;
    let viewerHasParent = false;
    let viewerId: Id<"users"> | undefined;
    if (user) {
      viewerId = user._id;
      viewerAge = await effectiveAge(ctx, user);
      if (user.accountType === "teen") viewerHasParent = await hasApprovedParent(ctx, user._id);
    }

    // All missions with pending status; missions flagged by the anti-scam
    // engine are hidden from everyone except their publisher until cleared.
    let missions = await ctx.db
      .query("missions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .collect();
    missions = missions.filter(
      (m) => !m.underReview || m.publisherId === viewerId,
    );

    if (args.category) missions = missions.filter((m) => m.categorySlug === args.category);
    if (args.maxPrice !== undefined) missions = missions.filter((m) => m.priceEuros <= args.maxPrice!);
    if (args.maxDuration !== undefined)
      missions = missions.filter((m) => m.durationMin <= args.maxDuration!);
    if (args.city) missions = missions.filter((m) => m.city.toLowerCase() === args.city!.toLowerCase());
    if (args.missionType) missions = missions.filter((m) => (m.missionType ?? "verified") === args.missionType);
    if (args.search) {
      const s = args.search.toLowerCase();
      missions = missions.filter(
        (m) =>
          m.title.toLowerCase().includes(s) ||
          m.description.toLowerCase().includes(s) ||
          m.categorySlug.includes(s) ||
          (getCategory(m.categorySlug)?.label ?? "").toLowerCase().includes(s),
      );
    }

    return missions.map((m) => publicMission(m, viewerAge, viewerHasParent, viewerId));
  },
});

/** Missions published by the current adult. */
export const myMissions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const missions = await ctx.db
      .query("missions")
      .withIndex("by_publisher", (q) => q.eq("publisherId", user._id))
      .order("desc")
      .collect();
    return missions.map((m) => ({
      ...publicMission(m, null, false, user._id),
      exactAddress: m.exactAddress, // publisher sees their own address
    }));
  },
});

/** Missions a teen has applied to. */
export const myApplications = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .order("desc")
      .collect();
    const result = [];
    for (const app of apps) {
      const mission = await ctx.db.get(app.missionId);
      if (!mission) continue;
      result.push({
        application: { _id: app._id, status: app.status, message: app.message, createdAt: app.createdAt },
        mission: publicMission(mission, null, false, user._id),
      });
    }
    return result;
  },
});

/** Mission detail — precise address only for publisher or confirmed teen. */
export const getMission = query({
  args: { missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) return null;
    // Anti-fraud: a mission held for moderation is invisible except to its
    // publisher — even by direct ID access.
    if (mission.underReview && mission.publisherId !== user?._id) {
      return null;
    }

    let viewerAge: number | null = null;
    let viewerHasParent = false;
    let viewerId: Id<"users"> | undefined;
    if (user) {
      viewerId = user._id;
      viewerAge = await effectiveAge(ctx, user);
      if (user.accountType === "teen") viewerHasParent = await hasApprovedParent(ctx, user._id);
    }

    const base = publicMission(mission, viewerAge, viewerHasParent, viewerId);

    // Who can see the exact address? Publisher always; teen only after assignment.
    let showExactAddress = mission.publisherId === viewerId;
    if (!showExactAddress && user && user.accountType === "teen") {
      const booking = await ctx.db
        .query("bookings")
        .withIndex("by_mission", (q) => q.eq("missionId", args.missionId))
        .first();
      if (booking && booking.teenId === user._id && booking.status !== "cancelled") {
        showExactAddress = true;
      }
    }

    // Has the current teen already applied?
    let myApplicationStatus: string | null = null;
    if (user && user.accountType === "teen") {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_teen", (q) => q.eq("teenId", user._id))
        .collect();
      const mine = apps.find((a) => a.missionId === args.missionId);
      myApplicationStatus = mine?.status ?? null;
    }

    const publisher = await getProfile(ctx, mission.publisherId);
    return {
      ...base,
      exactAddress: showExactAddress ? mission.exactAddress ?? null : null,
      showExactAddress,
      myApplicationStatus,
      publisher: publisher
        ? {
            firstName: publisher.firstName,
            avatarIcon: publisher.avatarIcon,
            city: publisher.city,
            verifiedEmail: publisher.verifiedEmail ?? false,
            verifiedIdentity: publisher.verifiedIdentity ?? false,
            verifiedPayment: publisher.verifiedPayment ?? false,
          }
        : null,
    };
  },
});

/** Create a mission (adults/organizations only). Safety gates are computed server-side. */
export const createMission = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    categorySlug: v.string(),
    priceEuros: v.number(),
    durationMin: v.number(),
    scheduledDate: v.string(),
    scheduledTime: v.string(),
    city: v.string(),
    area: v.string(),
    missionType: v.optional(v.union(v.literal("quick"), v.literal("verified"))),
    maxApplicants: v.optional(v.number()),
    requiredSkills: v.optional(v.array(v.string())),
    equipment: v.optional(v.string()),
    safetyNotes: v.optional(v.string()),
    requiresPin: v.optional(v.boolean()),
    exactAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isAdultAccount(user)) {
      throw new Error("FORBIDDEN: seuls les adultes et organisations peuvent publier des missions.");
    }
    // Suspended/blocked accounts cannot publish (deny by default).
    await requireActiveAccount(ctx, user);
    // Anti-bot / anti-spam: publication rate limit.
    const rl = await consumeRateLimit(ctx, "missionCreate", user._id);
    if (!rl.ok) {
      throw new Error("Trop de missions publiées récemment — réessaie plus tard.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!profile) throw new Error("NO_PROFILE: complète ton profil avant de publier.");

    // Server-side sanity checks (anti-fraud basics).
    if (args.priceEuros < 3 || args.priceEuros > 500) {
      throw new Error("Le prix doit être compris entre 3 € et 500 €.");
    }
    if (args.durationMin < 15 || args.durationMin > 480) {
      throw new Error("La durée doit être comprise entre 15 minutes et 8 heures.");
    }
    if (!getCategory(args.categorySlug)) {
      throw new Error("Catégorie inconnue.");
    }
    if (!args.title.trim() || !args.description.trim()) {
      throw new Error("Titre et description obligatoires.");
    }

    // Strict input hygiene (control chars, length caps).
    const title = sanitizeText(args.title, 80);
    const description = sanitizeText(args.description, 2000);
    const city = sanitizeText(args.city, 60);
    const area = sanitizeText(args.area, 60);
    const exactAddress = args.exactAddress ? sanitizeText(args.exactAddress, 160) : undefined;
    if (!title || !description) {
      throw new Error("Titre et description obligatoires.");
    }

    // === ANTI-SCAM ENGINE — risky offers never reach teens unchecked ===
    const scan = scanMission({
      title,
      description,
      priceEuros: args.priceEuros,
      durationMin: args.durationMin,
    });

    const cat = getCategory(args.categorySlug)!;
    const risk = cat.risk;
    const accessForTeens = evaluateTeenAccess(
      {
        categorySlug: args.categorySlug,
        riskLevel: risk,
        scheduledDate: args.scheduledDate,
        scheduledTime: args.scheduledTime,
        durationMin: args.durationMin,
      },
      16, // reference age: a 16-year-old — the most common case
    );
    const allowedForTeens = accessForTeens.level !== "adults_only";

    const missionId = await ctx.db.insert("missions", {
      publisherId: user._id,
      title,
      description,
      categorySlug: args.categorySlug,
      priceEuros: args.priceEuros,
      durationMin: args.durationMin,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      city,
      area,
      status: "published",
      riskLevel: risk,
      missionType: args.missionType ?? "verified",
      maxApplicants: Math.max(1, args.maxApplicants ?? 5),
      allowedForTeens,
      accessNote: allowedForTeens ? accessForTeens.reasons[0] : "Réservée aux majeurs.",
      requiredSkills: args.requiredSkills,
      equipment: args.equipment,
      safetyNotes: args.safetyNotes,
      requiresPin: args.requiresPin ?? false,
      applicantCount: 0,
      createdAt: Date.now(),
      exactAddress,
      // Anti-fraud: hold risky offers for human moderation.
      underReview: scan.blocked,
      reviewReasons: scan.blocked ? scan.reasons : undefined,
    });

    if (scan.blocked) {
      await ctx.db.insert("fraudReviews", {
        missionId,
        publisherId: user._id,
        score: scan.score,
        reasons: scan.reasons,
        status: "pending",
        createdAt: Date.now(),
      });
      await logSecurityEvent(ctx, {
        type: SECURITY_EVENTS.MISSION_FLAGGED,
        severity: "warning",
        userId: user._id,
        targetType: "mission",
        targetId: missionId,
        details: `score=${scan.score}; ${scan.reasons.join(" | ")}`.slice(0, 400),
      });
    }

    return missionId;
  },
});

/** Cancel a published mission (publisher only). */
export const cancelMission = mutation({
  args: { missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (mission.publisherId !== user._id) throw new Error("FORBIDDEN");
    if (mission.status !== "published" && mission.status !== "assigned") {
      throw new Error("Cette mission ne peut plus être annulée.");
    }
    await ctx.db.patch(args.missionId, { status: "cancelled" });
    // Notify applicants.
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_mission", (q) => q.eq("missionId", args.missionId))
      .collect();
    for (const app of apps) {
      if (app.status === "pending") {
        await ctx.db.patch(app._id, { status: "declined" });
        await ctx.db.insert("notifications", {
          userId: app.teenId,
          type: "mission",
          title: "Mission annulée",
          body: `« ${mission.title} » a été annulée par son créateur.`,
          read: false,
          createdAt: Date.now(),
        });
      }
    }
  },
});
