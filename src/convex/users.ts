import { getAuthUserId } from "@convex-dev/auth/server";
import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimitReadonly } from "./lib/security";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Brute-force guard for the OTP flow: queried by the sign-in UI before each
 * code request / code check. The counters themselves are consumed by the
 * login mutations below — a blocked sender receives a hard refusal.
 */
export const loginAllowed = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { allowed: false, reason: "invalid" };
    const okRequest = await checkRateLimitReadonly(ctx, "loginRequest", email);
    if (!okRequest) return { allowed: false, reason: "too_many_code_requests" };
    const okCheck = await checkRateLimitReadonly(ctx, "login", email);
    if (!okCheck) return { allowed: false, reason: "too_many_attempts" };
    return { allowed: true, reason: null };
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};
