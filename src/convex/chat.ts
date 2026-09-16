import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  createNotification,
  getProfile,
  getOrCreateConversation,
  insertSystemMessage,
  requireUser,
} from "./lib/helpers";
import { classifyMessage } from "./lib/fraud";
import { consumeRateLimit, logSecurityEvent, requireActiveAccount, SECURITY_EVENTS, sanitizeText } from "./lib/security";

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

/** Messages of a conversation (participants only, capped). */
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
      .order("desc")
      .take(200)
      .then((rows) => rows.reverse()); // chronological order, bounded size
  },
});

/** Send a message; counterpart gets a notification. Security-classified server-side. */
export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireActiveAccount(ctx, user);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || !conv.participantIds.includes(user._id)) throw new Error("FORBIDDEN");

    // Anti-spam / anti-bot: hard server-side rate limit.
    const rl = await consumeRateLimit(ctx, "message", user._id);
    if (!rl.ok) {
      throw new Error("Trop de messages envoyés — fais une pause, réessaie dans quelques minutes.");
    }

    const body = sanitizeText(args.body, 2000);
    if (!body) throw new Error("Le message est vide.");

    // === Content security classifier (phishing, money, codes, grooming…) ===
    const cls = classifyMessage(body);
    const BLOCKED = new Set([
      "bank_details",
      "password_or_code",
      "phone_number",
      "email_address",
      "home_address",
      "private_photos",
      "gross_or_sexual",
      "harassment",
    ]);
    const blocked = cls.flags.some((f) => BLOCKED.has(f));
    if (blocked) {
      await logSecurityEvent(ctx, {
        type: SECURITY_EVENTS.MESSAGE_FLAGGED,
        severity: "warning",
        userId: user._id,
        targetType: "conversation",
        targetId: args.conversationId,
        details: cls.flags.join(","),
      });
      throw new Error(cls.warning ?? "Message bloqué pour ta sécurité.");
    }

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: user._id,
      body,
      type: "user",
      flags: cls.flags.length ? cls.flags : undefined,
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

    // Warn-only flags (external links, off-platform payment): stored so the
    // UI can show a caution banner next to the message.
    return { warning: cls.warning };
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

/** System helper (server-only): post an automatic mission message. */
export const postSystemMessage = internalMutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    await insertSystemMessage(ctx, args.conversationId, args.body);
  },
});
