import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createNotification,
  getProfile,
  getOrCreateConversation,
  insertSystemMessage,
  requireUser,
} from "./lib/helpers";

/** Conversations for the current user with counterpart + mission context. */
export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const all = await ctx.db.query("conversations").collect();
    const mine = all
      .filter((c) => c.participantIds.includes(user._id))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    const result = [];
    for (const conv of mine) {
      const counterpartId = conv.participantIds.find((id) => id !== user._id);
      const counterpart = counterpartId ? await getProfile(ctx, counterpartId) : null;
      const mission = conv.missionId ? await ctx.db.get(conv.missionId) : null;
      result.push({
        _id: conv._id,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview ?? "Nouvelle conversation",
        missionId: conv.missionId ?? null,
        missionTitle: mission?.title ?? null,
        missionDate: mission?.scheduledDate ?? null,
        missionTime: mission?.scheduledTime ?? null,
        counterpart: counterpart
          ? { firstName: counterpart.firstName, avatarIcon: counterpart.avatarIcon ?? null }
          : { firstName: "Utilisateur", avatarIcon: null },
      });
    }
    return result;
  },
});

/** Messages of a conversation (participants only). */
export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || !conv.participantIds.includes(user._id)) {
      throw new Error("FORBIDDEN: cette conversation ne t'est pas accessible.");
    }
    return ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

/** Send a message; counterpart gets a notification. */
export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || !conv.participantIds.includes(user._id)) throw new Error("FORBIDDEN");
    const body = args.body.trim();
    if (!body) throw new Error("Le message est vide.");
    if (body.length > 2000) throw new Error("Message trop long (2000 caractères max).");

    // === Basic content filter ===
    const forbiddenPatterns = [
      { re: /\b(?:07|06)\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/, label: "numéro de téléphone" },
      { re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, label: "adresse email" },
      { re: /\b(?:iban|rib|cb)\b/i, label: "coordonnée bancaire" },
      { re: /\b(?:tu\s+peux\s+venir\s+chez\s+moi|mon\s+adresse\s+est)\b/i, label: "adresse personnelle" },
    ];
    for (const { re, label } of forbiddenPatterns) {
      if (re.test(body)) {
        throw new Error(
          `SÉCURITÉ: partager un ${label} est bloqué pour te protéger. Passe par l'adresse fournie dans la mission.`,
        );
      }
    }

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: user._id,
      body,
      type: "user",
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 80),
    });

    const counterpartId = conv.participantIds.find((id) => id !== user._id);
    if (counterpartId) {
      const senderProfile = await getProfile(ctx, user._id);
      await createNotification(ctx, {
        userId: counterpartId,
        type: "message",
        title: senderProfile?.firstName ?? "Nouveau message",
        body: body.slice(0, 80),
        link: `/messages/${args.conversationId}`,
      });
    }
  },
});

/** Start (or find) the conversation with a user about a booking/mission. */
export const startConversation = mutation({
  args: {
    otherUserId: v.id("users"),
    bookingId: v.optional(v.id("bookings")),
    missionId: v.optional(v.id("missions")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const id = await getOrCreateConversation(ctx, user._id, args.otherUserId, args.missionId, args.bookingId);
    return id;
  },
});

/** System helper: post an automatic mission message. */
export const postSystemMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    await insertSystemMessage(ctx, args.conversationId, args.body);
  },
});
