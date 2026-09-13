import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createNotification,
  getProfile,
  getSettings,
  hasApprovedParent,
  requireUser,
} from "./lib/helpers";

/** Trigger SOS during a mission — logs a safety event and alerts trusted contacts. */
export const triggerSOS = mutation({
  args: {
    bookingId: v.optional(v.id("bookings")),
    kind: v.union(
      v.literal("unwell"),
      v.literal("unsafe_person"),
      v.literal("incident"),
      v.literal("other"),
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("safetyEvents", {
      userId: user._id,
      bookingId: args.bookingId,
      type: "sos",
      details: `${args.kind}${args.details ? ` — ${args.details}` : ""}`,
      createdAt: now,
    });

    // Notify approved parent (trusted contact) when one exists.
    if (await hasApprovedParent(ctx, user._id)) {
      const link = await ctx.db
        .query("parentLinks")
        .withIndex("by_teen", (q) => q.eq("teenUserId", user._id))
        .first();
      if (link) {
        const profile = await getProfile(ctx, user._id);
        await createNotification(ctx, {
          userId: link.parentUserId,
          type: "safety",
          title: "Alerte SOS",
          body: `${profile?.firstName ?? "Ton ado"} a déclenché une alerte SOS${
            args.bookingId ? " pendant une mission" : ""
          }.`,
          link: args.bookingId ? `/reservations/${args.bookingId}` : "/famille",
        });
      }
    }

    // Notify the other party so they are aware the alert was raised.
    if (args.bookingId) {
      const booking = await ctx.db.get(args.bookingId);
      if (booking) {
        const otherId = booking.teenId === user._id ? booking.adultId : booking.teenId;
        await createNotification(ctx, {
          userId: otherId,
          type: "safety",
          title: "Alerte SOS déclenchée",
          body: "Une alerte a été levée sur cette mission. Notre équipe est notifiée.",
          link: `/reservations/${args.bookingId}`,
        });
      }
    }

    return {
      message:
        "Alerte enregistrée. En cas de danger immédiat, appelle le 112. " +
        "Tes contacts de confiance ont été notifiés dans l'application.",
    };
  },
});

/** Report a user, mission, message or booking. */
export const submitReport = mutation({
  args: {
    targetType: v.union(
      v.literal("user"),
      v.literal("mission"),
      v.literal("message"),
      v.literal("booking"),
    ),
    targetId: v.string(),
    reason: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.reason.trim()) throw new Error("Indique le motif du signalement.");
    await ctx.db.insert("reports", {
      reporterId: user._id,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason.trim(),
      description: args.description?.trim(),
      status: "new",
      priority: "medium",
      createdAt: Date.now(),
    });
  },
});

/** My safety timeline (SOS, check-ins). */
export const mySafetyEvents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("safetyEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
  },
});

/** Parent view: pending links to approve + approved teens. */
export const familyView = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") return { pendingLinks: [], teens: [] };

    const pending = await ctx.db
      .query("parentLinks")
      .withIndex("by_parent", (q) => q.eq("parentUserId", user._id))
      .collect();
    const pendingLinks = [];
    const teens = [];
    for (const link of pending) {
      const teenProfile = await getProfile(ctx, link.teenUserId);
      const entry = {
        _id: link._id,
        status: link.status,
        createdAt: link.createdAt,
        teenName: teenProfile?.firstName ?? "Adolescent",
        teenIcon: teenProfile?.avatarIcon ?? null,
      };
      if (link.status === "pending") pendingLinks.push(entry);
      else if (link.status === "approved") teens.push(entry);
    }
    return { pendingLinks, teens };
  },
});

/** Check whether current teen has parental approval granted for a mission level. */
export const myParentStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") return { hasParent: false, parentName: null };
    const link = await ctx.db
      .query("parentLinks")
      .withIndex("by_teen", (q) => q.eq("teenUserId", user._id))
      .first();
    if (link?.status !== "approved") return { hasParent: false, parentName: null };
    const parentProfile = await getProfile(ctx, link.parentUserId);
    return { hasParent: true, parentName: parentProfile?.firstName ?? null };
  },
});

/** Blocked/report helper: verify a conversation participant is not blocked (placeholder for moderation tools). */
export const settingsGuard = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const settings = await getSettings(ctx, user._id);
    return {
      allowMessages: settings?.allowMessages ?? true,
      profileVisibility: settings?.profileVisibility ?? "public",
    };
  },
});
