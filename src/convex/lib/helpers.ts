import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "../_generated/server";
import { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeAge } from "./safety";

export async function getCurrentUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get(userId);
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("UNAUTHENTICATED: connecte-toi pour continuer.");
  return user;
}

export async function requireProfile(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"profiles">> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!profile) throw new Error("NO_PROFILE: complète d'abord ton profil.");
  return profile;
}

export async function getProfile(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first();
}

export async function getSettings(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
}

export function isAdultAccount(user: Doc<"users">): boolean {
  return user.accountType === "adult" || user.accountType === "organization";
}

/** Effective age: verified birthdate for teens, 99 for adult accounts. */
export async function effectiveAge(ctx: QueryCtx, user: Doc<"users">): Promise<number | null> {
  if (user.accountType !== "teen") return user.accountType ? 99 : null;
  const profile = await getProfile(ctx, user._id);
  return computeAge(profile?.birthDate);
}

/**
 * Does this teen have an approved parent link (parental supervision)?
 * Parental approval is required for 🟡 missions — safety rule, never bypassed.
 */
export async function hasApprovedParent(ctx: QueryCtx, teenUserId: Id<"users">): Promise<boolean> {
  const link = await ctx.db
    .query("parentLinks")
    .withIndex("by_teen", (q) => q.eq("teenUserId", teenUserId))
    .first();
  return link?.status === "approved";
}

export async function createNotification(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: Doc<"notifications">["type"];
    title: string;
    body?: string;
    link?: string;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    read: false,
    createdAt: Date.now(),
  });
}

export async function creditWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  field: "availableCents" | "pendingCents" | "totalEarnedCents",
  deltaCents: number,
) {
  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (wallet) {
    await ctx.db.patch(wallet._id, {
      [field]: Math.max(0, wallet[field] + deltaCents),
    });
  } else {
    await ctx.db.insert("wallets", {
      userId,
      availableCents: field === "availableCents" ? Math.max(0, deltaCents) : 0,
      pendingCents: field === "pendingCents" ? Math.max(0, deltaCents) : 0,
      totalEarnedCents: field === "totalEarnedCents" ? Math.max(0, deltaCents) : 0,
    });
  }
}

/** Get or create the 1:1 conversation between two users (optionally tied to a mission/booking). */
export async function getOrCreateConversation(
  ctx: MutationCtx,
  a: Id<"users">,
  b: Id<"users">,
  missionId?: Id<"missions">,
  bookingId?: Id<"bookings">,
): Promise<Id<"conversations">> {
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_mission", (q) => (missionId ? q.eq("missionId", missionId) : q.eq("missionId", undefined)))
    .collect();
  const found = existing.find(
    (c) =>
      c.participantIds.includes(a) &&
      c.participantIds.includes(b) &&
      c.participantIds.length === 2,
  );
  if (found) return found._id;
  return ctx.db.insert("conversations", {
    missionId,
    bookingId,
    participantIds: [a, b],
    lastMessageAt: Date.now(),
  });
}

export async function insertSystemMessage(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  body: string,
) {
  await ctx.db.insert("messages", {
    conversationId,
    senderId: undefined,
    body,
    type: "system",
    createdAt: Date.now(),
  });
  await ctx.db.patch(conversationId, {
    lastMessageAt: Date.now(),
    lastMessagePreview: body,
  });
}
