import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * À LA PIÈCE — server-side security primitives.
 *
 * Everything here runs on the backend: the client can never bypass the rate
 * limiter, forge a security event, or read another user's session data.
 */

// ---------------------------------------------------------------------------
// Security event journal
// ---------------------------------------------------------------------------

/** Canonical event types (kept as strings for easy extension). */
export const SECURITY_EVENTS = {
  LOGIN_SUCCESS: "auth.login",
  LOGIN_FAILED: "auth.login_failed",
  BRUTE_FORCE_BLOCK: "auth.brute_force_block",
  LOGOUT_ALL: "auth.sessions_revoked",
  PASSWORD_OR_EMAIL_CHANGE: "auth.sensitive_change",
  RECOVERY_EMAIL_SENT: "auth.recovery_email_sent",
  MESSAGE_FLAGGED: "moderation.message_flagged",
  MISSION_FLAGGED: "moderation.mission_flagged",
  MISSION_APPROVED: "moderation.mission_approved",
  REPORT_AUTO_PRIORITY: "moderation.report_auto_priority",
  RATE_LIMIT: "security.rate_limited",
  ACCOUNT_TYPE_CHANGED: "security.account_type_changed",
  IDENTITY_SUBMITTED: "identity.submitted",
  IDENTITY_APPROVED: "identity.approved",
  IDENTITY_REJECTED: "identity.rejected",
  ACCOUNT_SUSPENDED: "admin.account_suspended",
  DATA_EXPORTED: "gdpr.data_exported",
  DATA_DELETED: "gdpr.data_deleted",
} as const;

type Severity = "info" | "warning" | "critical";

/**
 * Query-side rate check (read-only, no counter update). Used where a query
 * must refuse to run for a flood source without mutating anything.
 */
export async function checkRateLimitReadonly(
  ctx: QueryCtx,
  rule: RateRuleName,
  subject: string,
): Promise<boolean> {
  const conf = RATE_RULES[rule];
  const now = Date.now();
  const keyBase = `${rule}:${subject}`;
  const blockRow = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", keyBase))
    .first();
  if (blockRow?.blockedUntil && blockRow.blockedUntil > now) return false;
  const windowStart = Math.floor(now / conf.windowMs) * conf.windowMs;
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", windowKey(rule, subject, windowStart)))
    .first();
  return (row?.count ?? 0) < conf.max;
}

export async function logSecurityEvent(
  ctx: MutationCtx,
  args: {
    type: string;
    severity?: Severity;
    userId?: Id<"users">;
    targetType?: string;
    targetId?: string;
    details?: string;
  },
) {
  // Hard hygiene rule: never journal secrets. Redact defensively in case a
  // caller passes something sensitive by mistake.
  const REDACTED = /\b(sk_[a-z0-9_]+|whsec_[a-z0-9_]+|fb_[a-z_]+[a-z0-9]+|Bearer\s+\S+)\b/gi;
  const details = args.details?.replace(REDACTED, "[redacted]").slice(0, 400);
  await ctx.db.insert("securityEvents", {
    userId: args.userId,
    type: args.type,
    severity: args.severity ?? "info",
    targetType: args.targetType,
    targetId: args.targetId,
    details,
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Rate limiting (sliding fixed windows, server-enforced)
// ---------------------------------------------------------------------------

interface LimitRule {
  max: number;
  windowMs: number;
  /** Consecutive violations that trigger a temporary hard block. */
  blockAfterViolations?: number;
  blockMs?: number;
}

export const RATE_RULES = {
  /** Sign-in / OTP code checks per email — brute-force protection. */
  login: { max: 5, windowMs: 10 * 60_000, blockAfterViolations: 3, blockMs: 15 * 60_000 },
  /** OTP code requests per email — prevents email bombing. */
  loginRequest: { max: 4, windowMs: 15 * 60_000, blockAfterViolations: 2, blockMs: 30 * 60_000 },
  /** Messages per user — spam / automated harassment. */
  message: { max: 25, windowMs: 5 * 60_000 },
  /** Mission publications per account. */
  missionCreate: { max: 8, windowMs: 60 * 60_000 },
  /** Applications + quick claims per teen. */
  apply: { max: 15, windowMs: 30 * 60_000 },
  /** Reports per user — prevents report-bombing. */
  report: { max: 10, windowMs: 60 * 60_000 },
  /** Account data exports / deletion requests. */
  gdpr: { max: 3, windowMs: 24 * 60 * 60_000 },
  /** Recovery emails per account. */
  recovery: { max: 3, windowMs: 15 * 60_000 },
  /** Step-up codes for bank account changes — prevents code bombing. */
  bankChange: { max: 3, windowMs: 15 * 60_000, blockAfterViolations: 2, blockMs: 60 * 60_000 },
  /** Account type switches (teen/adult/parent/organization) per account. */
  accountTypeChange: { max: 3, windowMs: 24 * 60 * 60_000, blockAfterViolations: 2, blockMs: 24 * 60 * 60_000 },
  /** Identity document uploads per account — storage flooding guard. */
  identityUpload: { max: 5, windowMs: 15 * 60_000 },
  /** Identity document submissions per account. */
  identitySubmit: { max: 3, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, LimitRule>;

export type RateRuleName = keyof typeof RATE_RULES;

function windowKey(rule: string, subject: string, windowStart: number) {
  return `${rule}:${subject}:${windowStart}`;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Count one unit against `rule` for `subject`. Returns ok=false when the
 * caller must be rejected. The counter and any hard block live server-side in
 * the `rateLimits` table — clients cannot reset them.
 */
export async function consumeRateLimit(
  ctx: MutationCtx,
  rule: RateRuleName,
  subject: string,
): Promise<RateResult> {
  const conf = RATE_RULES[rule];
  const now = Date.now();

  // Respect an existing hard block.
  const keyBase = `${rule}:${subject}`;
  const blockRow = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", keyBase))
    .first();
  if (blockRow?.blockedUntil && blockRow.blockedUntil > now) {
    return { ok: false, remaining: 0, retryAfterMs: blockRow.blockedUntil - now };
  }

  const windowStart = Math.floor(now / conf.windowMs) * conf.windowMs;
  const key = windowKey(rule, subject, windowStart);
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!row) {
    await ctx.db.insert("rateLimits", { key, windowStart, count: 1 });
    return { ok: true, remaining: conf.max - 1, retryAfterMs: 0 };
  }

  const next = row.count + 1;
  if (next > conf.max) {
    const violations = (blockRow?.count ?? 0) + 1;
    const shouldBlock =
      "blockAfterViolations" in conf &&
      conf.blockAfterViolations !== undefined &&
      violations >= conf.blockAfterViolations;
    if (shouldBlock && blockRow) {
      await ctx.db.patch(blockRow._id, { blockedUntil: now + conf.blockMs! });
      await logSecurityEvent(ctx, {
        type: SECURITY_EVENTS.BRUTE_FORCE_BLOCK,
        severity: "critical",
        details: `Temporairement bloqué (${rule}) — trop de tentatives.`,
      });
    } else if (blockRow) {
      await ctx.db.patch(blockRow._id, { count: violations });
    } else {
      await ctx.db.insert("rateLimits", {
        key: keyBase,
        windowStart: now,
        count: 1,
      });
    }
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.RATE_LIMIT,
      severity: "warning",
      details: `Limite atteinte: ${rule}.`,
    });
    return { ok: false, remaining: 0, retryAfterMs: windowStart + conf.windowMs - now };
  }

  await ctx.db.patch(row._id, { count: next });
  return { ok: true, remaining: conf.max - next, retryAfterMs: 0 };
}

// ---------------------------------------------------------------------------
// Account / moderation status helpers (deny by default)
// ---------------------------------------------------------------------------

/** A suspended or blocked account can sign in technically but can do nothing. */
export async function requireActiveAccount(ctx: QueryCtx, user: Doc<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  const status = profile?.status ?? "active";
  if (status !== "active") {
    throw new Error(
      "COMPTE_SUSPENDU: ton compte est actuellement suspendu. Contacte le support via la page Sécurité.",
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Session revocation (sign out everywhere)
// ---------------------------------------------------------------------------

/** Invalidate every active session of a user — used by "sign out all devices". */
export async function revokeAllSessions(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const now = Date.now();
  for (const s of sessions) {
    if (s.expirationTime > now) {
      await ctx.db.patch(s._id, { expirationTime: now - 1 });
    }
  }
  return sessions.length;
}

/** How many live sessions does the user have? */
export async function countActiveSessions(ctx: QueryCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  const now = Date.now();
  return sessions.filter((s) => s.expirationTime > now).length;
}

// ---------------------------------------------------------------------------
// Internal-call guard (webhooks / scheduled actions only)
// ---------------------------------------------------------------------------

/**
 * Blocks client calls to mutations that must only be reached from server-side
 * actions (Stripe webhook, scheduled payouts). With INTERNAL_FUNCTION_TOKEN
 * configured, only callers presenting the token pass; without it, only calls
 * carrying no user identity (actions/schedulers) pass — an authenticated
 * client is always rejected.
 */
export async function assertInternalCall(
  ctx: QueryCtx | MutationCtx,
  providedToken?: string,
) {
  const configured = process.env.INTERNAL_FUNCTION_TOKEN;
  if (configured) {
    if (providedToken !== configured) {
      throw new Error("FORBIDDEN_INTERNAL");
    }
    return;
  }
  const identity = await ctx.auth.getUserIdentity();
  if (identity !== null) {
    throw new Error("FORBIDDEN_INTERNAL");
  }
}

/** The token an action passes to internal mutations (undefined in demo mode). */
export function internalToken(): string | undefined {
  return process.env.INTERNAL_FUNCTION_TOKEN;
}

// ---------------------------------------------------------------------------
// Input hygiene (strict validation beyond Convex validators)
// ---------------------------------------------------------------------------

/** Strip control characters and clamp length — cheap defense-in-depth. */
export function sanitizeText(input: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned.slice(0, maxLength);
}
