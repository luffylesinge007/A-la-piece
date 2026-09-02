import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creditWallet, requireUser } from "./lib/helpers";

/** Wallet for the current user (creates an empty one if missing). */
export const getWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!wallet) {
      // No mutation in a query: return a virtual empty wallet.
      return { availableCents: 0, pendingCents: 0, totalEarnedCents: 0, _id: null };
    }
    return {
      _id: wallet._id,
      availableCents: wallet.availableCents,
      pendingCents: wallet.pendingCents,
      totalEarnedCents: wallet.totalEarnedCents,
    };
  },
});

/** Transaction history for the current user. */
export const myTransactions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

/** Savings goals (stored as transactions metadata-free table via wallets schema extension). */
export const myGoals = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("savingsGoals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const addGoal = mutation({
  args: { label: v.string(), targetCents: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.targetCents <= 0) throw new Error("Le montant de l'objectif doit être positif.");
    await ctx.db.insert("savingsGoals", {
      userId: user._id,
      label: args.label.trim(),
      targetCents: args.targetCents,
      savedCents: 0,
      createdAt: Date.now(),
    });
  },
});

export const allocateToGoal = mutation({
  args: { goalId: v.id("savingsGoals"), amountCents: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const goal = await ctx.db.get(args.goalId);
    if (!goal || goal.userId !== user._id) throw new Error("NOT_FOUND");
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const available = wallet?.availableCents ?? 0;
    if (args.amountCents <= 0) throw new Error("Montant invalide.");
    if (args.amountCents > available) {
      throw new Error("Solde insuffisant pour cet objectif.");
    }
    await creditWallet(ctx, user._id, "availableCents", -args.amountCents);
    await ctx.db.patch(goal._id, { savedCents: goal.savedCents + args.amountCents });
  },
});

export const deleteGoal = mutation({
  args: { goalId: v.id("savingsGoals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const goal = await ctx.db.get(args.goalId);
    if (!goal || goal.userId !== user._id) throw new Error("NOT_FOUND");
    // Money allocated to a deleted goal returns to the available balance.
    if (goal.savedCents > 0) {
      await creditWallet(ctx, user._id, "availableCents", goal.savedCents);
    }
    await ctx.db.delete(goal._id);
  },
});
