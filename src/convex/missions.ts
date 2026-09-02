import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  effectiveAge,
  getCurrentUser,
  hasApprovedParent,
  isAdultAccount,
  requireUser,
} from "./lib/helpers";
import { evaluateTeenAccess, canTeenApply, getCategory } from "./lib/safety";
import type { Id } from "./_generated/dataModel";

/** Public shape of a mission as seen in lists — no exact address. */
function publicMission(doc: any, viewerAge: number | null, viewerHasParent: boolean, viewerId?: Id<"users">) {
  const access = evaluateTeenAccess(doc, viewerAge);
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
    requiredSkills: doc.requiredSkills ?? [],
    equipment: doc.equipment,
    safetyNotes: doc.safetyNotes,
    teamSize: doc.teamSize,
    requiresPin: doc.requiresPin ?? false,
    applicantCount: doc.applicantCount ?? 0,
    publisherId: doc.publisherId,
    createdAt: doc.createdAt,
    access,
    canApply: doc.publisherId !== viewerId && canTeenApply(access, viewerHasParent),
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

    let missions = await ctx.db
      .query("missions")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .collect();

    if (args.category) missions = missions.filter((m) => m.categorySlug === args.category);
    if (args.maxPrice !== undefined) missions = missions.filter((m) => m.priceEuros <= args.maxPrice!);
    if (args.maxDuration !== undefined)
      missions = missions.filter((m) => m.durationMin <= args.maxDuration!);
    if (args.city) missions = missions.filter((m) => m.city.toLowerCase() === args.city!.toLowerCase());
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
            avatarEmoji: publisher.avatarEmoji,
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
    await requireUser(ctx); // ensure profile exists
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
      title: args.title.trim(),
      description: args.description.trim(),
      categorySlug: args.categorySlug,
      priceEuros: args.priceEuros,
      durationMin: args.durationMin,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      city: args.city.trim(),
      area: args.area.trim(),
      status: "published",
      riskLevel: risk,
      allowedForTeens,
      accessNote: allowedForTeens ? accessForTeens.reasons[0] : "Réservée aux majeurs.",
      requiredSkills: args.requiredSkills,
      equipment: args.equipment,
      safetyNotes: args.safetyNotes,
      requiresPin: args.requiresPin ?? false,
      applicantCount: 0,
      createdAt: Date.now(),
      exactAddress: args.exactAddress?.trim(),
    });

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
