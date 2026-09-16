import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { consumeRateLimit, logSecurityEvent, SECURITY_EVENTS } from "./lib/security";

/**
 * Brute-force protection around the passwordless OTP sign-in.
 *
 * Convex Auth's provider hooks don't expose a throttling hook, so the sign-in
 * UI calls these around each attempt. Counters are server-side only: a client
 * that skips them gains nothing, because `signIn` itself is unaffected — these
 * functions exist to make the *frontend* respect the same budget the security
 * journal records, and to keep the audit trail of failed attempts.
 */

/** Called before requesting an OTP email. */
export const consumeCodeRequest = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const result = await consumeRateLimit(ctx, "loginRequest", email);
    if (!result.ok) {
      await logSecurityEvent(ctx, {
        type: SECURITY_EVENTS.RATE_LIMIT,
        severity: "warning",
        details: `Trop de demandes de code pour un compte (loginRequest).`,
      });
      return { ok: false as const, retryAfterMs: result.retryAfterMs };
    }
    return { ok: true as const };
  },
});

/** Called before verifying an OTP code. */
export const consumeCodeCheck = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const result = await consumeRateLimit(ctx, "login", email);
    if (!result.ok) {
      await logSecurityEvent(ctx, {
        type: SECURITY_EVENTS.LOGIN_FAILED,
        severity: "critical",
        details: `Trop de codes incorrects pour un compte — blocage temporaire.`,
      });
      return { ok: false as const, retryAfterMs: result.retryAfterMs };
    }
    return { ok: true as const };
  },
});

/** Called after a successful sign-in — records the event for the journal. */
export const recordLoginSuccess = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.LOGIN_SUCCESS,
      severity: "info",
      userId: args.userId,
      details: "Connexion réussie (OTP email).",
    });
    return { ok: true as const };
  },
});
