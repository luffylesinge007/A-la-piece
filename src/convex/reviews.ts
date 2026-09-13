import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createNotification, getProfile, requireUser } from "./lib/helpers";

/** Can the current user review this booking, and for whom? */
export const forBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    if (b.teenId !== user._id && b.adultId !== user._id) return null;
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    const mine = existing.find((r) => r.authorId === user._id);
    const targetUserId = b.teenId === user._id ? b.adultId : b.teenId;
    const mission = await ctx.db.get(b.missionId);
    return {
      canReview: b.status === "completed" && !mine,
      alreadyReviewed: !!mine,
      myRating: mine?.rating ?? null,
      targetUserId,
      missionTitle: mission?.title ?? "",
      partnerHasReviewed: existing.some((r) => r.authorId !== user._id),
    };
  },
});

/** Submit a review (both parties, after completion). */
export const submitReview = mutation({
  args: {
    bookingId: v.id("bookings"),
    rating: v.number(),
    punctuality: v.optional(v.number()),
    communication: v.optional(v.number()),
    quality: v.optional(v.number()),
    respect: v.optional(v.number()),
    reliability: v.optional(v.number()),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    if (b.teenId !== user._id && b.adultId !== user._id) throw new Error("FORBIDDEN");
    if (b.status !== "completed") {
      throw new Error("Les avis sont ouverts après la fin de la mission.");
    }
    if (args.rating < 1 || args.rating > 5) throw new Error("La note doit être entre 1 et 5.");

    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    if (existing.some((r) => r.authorId === user._id)) {
      throw new Error("Tu as déjà laissé un avis pour cette mission.");
    }

    const targetUserId = b.teenId === user._id ? b.adultId : b.teenId;
    await ctx.db.insert("reviews", {
      bookingId: b._id,
      missionId: b.missionId,
      authorId: user._id,
      targetUserId,
      rating: args.rating,
      punctuality: args.punctuality,
      communication: args.communication,
      quality: args.quality,
      respect: args.respect,
      reliability: args.reliability,
      comment: args.comment?.trim(),
      createdAt: Date.now(),
    });

    const mission = await ctx.db.get(b.missionId);
    await createNotification(ctx, {
      userId: targetUserId,
      type: "system",
      title: "Nouvel avis reçu",
      body: `« ${mission?.title ?? "Mission"} » — note ${args.rating}/5.`,
      link: "/profil",
    });
  },
});

/** Aggregated reputation for a user. */
export const reputation = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_target", (q) => q.eq("targetUserId", args.userId))
      .collect();
    if (reviews.length === 0) return { count: 0, average: null as number | null };
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    return {
      count: reviews.length,
      average: Math.round(avg * 10) / 10,
    };
  },
});

/** Reviews received by the current user. */
export const myReviews = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_target", (q) => q.eq("targetUserId", user._id))
      .order("desc")
      .collect();
    const result = [];
    for (const r of reviews) {
      const author = await getProfile(ctx, r.authorId);
      const mission = await ctx.db.get(r.missionId);
      result.push({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        authorName: author?.firstName ?? "Utilisateur",
        authorIcon: author?.avatarIcon ?? null,
        missionTitle: mission?.title ?? "",
      });
    }
    return result;
  },
});
