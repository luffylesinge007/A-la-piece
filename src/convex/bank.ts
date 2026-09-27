import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { createNotification, getProfile, requireUser } from "./lib/helpers";
import { computeAge } from "./lib/safety";
import {
  consumeRateLimit,
  logSecurityEvent,
  sanitizeText,
  SECURITY_EVENTS,
} from "./lib/security";

/**
 * À LA PIÈCE — teen's own bank account for payouts (spec #43).
 *
 * Security model:
 * - The bank details themselves (IBAN…) NEVER touch our database: they live
 *   inside the regulated payment provider (Stripe Connect Express). We store
 *   only identifiers and display data (last4, bank name).
 * - Adding or changing the account always requires a step-up verification
 *   code sent to the account email — a stolen session alone cannot redirect
 *   a payout.
 * - For teens under 16, parental consent is requested once for the feature
 *   (never per payout, per spec).
 * - Payouts are executed by wallet.ts, gated on `payoutsEnabled` + consent.
 */

const CODE_TTL_MS = 10 * 60_000; // 10 minutes
const CODE_MAX_ATTEMPTS = 5;

const BANK_PURPOSE = "bank_account_change" as const;

/** 6-digit CSPRNG code (same shape as the auth OTP). */
function generateCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += (b % 10).toString();
  return out;
}

async function hashCode(salt: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** My bank account + consent state — sanitized (no secrets, minimal data). */
export const myBankAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") return null;
    const profile = await getProfile(ctx, user._id);
    const age = computeAge(profile?.birthDate);
    // Under-14: the payout feature itself needs a specific guardian consent
    // (independent from the signup discharge, per provider rules).
    const needsConsent = age === null || age < 14;
    const consent = profile?.bankConsent;
    return {
      account: profile?.bankAccount
        ? {
            holderName: profile.bankAccount.holderName,
            country: profile.bankAccount.country,
            status: profile.bankAccount.status,
            payoutsEnabled: profile.bankAccount.payoutsEnabled ?? false,
            last4: profile.bankAccount.last4,
            bankName: profile.bankAccount.bankName,
            createdAt: profile.bankAccount.createdAt,
          }
        : null,
      consent: consent ?? null,
      needsConsent,
      age,
      /** Ready to receive payouts: verified account + consent when required. */
      payoutReady:
        !!profile?.bankAccount &&
        profile.bankAccount.status === "verified" &&
        (profile.bankAccount.payoutsEnabled ?? false) &&
        (!needsConsent || consent?.status === "approved"),
    };
  },
});

/** Pending consent requests for the linked teens of the current parent. */
export const pendingBankConsents = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") return [];
    const profile = await getProfile(ctx, user._id);
    const teenIds = profile?.linkedTeenIds ?? [];
    const result = [];
    for (const teenId of teenIds) {
      const teenProfile = await getProfile(ctx, teenId);
      const consent = teenProfile?.bankConsent;
      if (consent?.status === "pending") {
        result.push({
          teenUserId: teenId,
          teenName: teenProfile?.firstName ?? "Adolescent",
          requestedAt: consent.requestedAt,
          hasAccount: !!teenProfile?.bankAccount,
        });
      }
    }
    return result;
  },
});

// ---------------------------------------------------------------------------
// Step-up verification code
// ---------------------------------------------------------------------------

/**
 * Request a verification code (emailed) before adding/altering the bank
 * account. Rate-limited server-side; the code is stored hashed only.
 */
export const requestChangeCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") {
      throw new Error("FORBIDDEN: le compte bancaire concerne les comptes adolescents.");
    }
    if (!user.email) throw new Error("Aucun email vérifié sur ce compte.");
    const rl = await consumeRateLimit(ctx, "bankChange", user._id);
    if (!rl.ok) {
      throw new Error("Trop de demandes — réessaie dans quelques minutes.");
    }

    // One live code at a time: drop previous unconsumed codes.
    const existing = await ctx.db
      .query("verificationCodes")
      .withIndex("by_user_purpose", (q) => q.eq("userId", user._id).eq("purpose", BANK_PURPOSE))
      .collect();
    for (const row of existing) {
      if (!row.consumedAt) await ctx.db.delete(row._id);
    }

    const code = generateCode();
    const salt = generateCode();
    const codeHash = await hashCode(salt, code);
    await ctx.db.insert("verificationCodes", {
      userId: user._id,
      purpose: BANK_PURPOSE,
      codeHash: `${salt}$${codeHash}`,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.bankActions.sendChangeCodeEmail, {
      email: user.email,
      code,
    });

    await logSecurityEvent(ctx, {
      type: "bank.code_requested",
      severity: "info",
      userId: user._id,
      details: "Code de vérification bancaire envoyé.",
    });
    return { sent: true, expiresAt: Date.now() + CODE_TTL_MS };
  },
});

/** Shared verify-and-consume step for every sensitive bank mutation. */
async function verifyCode(
  ctx: MutationCtx,
  userId: any,
  code: string,
): Promise<void> {
  const rows = await ctx.db
    .query("verificationCodes")
    .withIndex("by_user_purpose", (q) => q.eq("userId", userId).eq("purpose", BANK_PURPOSE))
    .collect();
  const live = rows
    .filter((r: any) => !r.consumedAt && r.expiresAt > Date.now())
    .sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
  if (!live) {
    throw new Error("Code expiré ou introuvable — demande un nouveau code.");
  }
  if (live.attempts >= CODE_MAX_ATTEMPTS) {
    throw new Error("Trop de tentatives — demande un nouveau code.");
  }
  const [salt, expected] = live.codeHash.split("$");
  const actual = await hashCode(salt, code);
  if (actual !== expected) {
    await ctx.db.patch(live._id, { attempts: live.attempts + 1 });
    await logSecurityEvent(ctx, {
      type: "bank.code_failed",
      severity: "warning",
      userId,
      details: "Code de vérification bancaire incorrect.",
    });
    throw new Error("Code incorrect.");
  }
  await ctx.db.patch(live._id, { consumedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Add / update / remove the account
// ---------------------------------------------------------------------------

/**
 * Register the payout account. Inputs are deliberately minimal: the bank
 * details themselves are collected by the provider (Stripe Connect), so an
 * IBAN typed in chat or in the app is never needed.
 */
export const confirmBankAccount = mutation({
  args: {
    code: v.string(),
    holderName: v.string(),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") throw new Error("FORBIDDEN");
    const profile = await getProfile(ctx, user._id);
    if (!profile) throw new Error("NO_PROFILE");

    await verifyCode(ctx, user._id, args.code.trim());

    const holderName = sanitizeText(args.holderName, 60);
    if (holderName.length < 3) {
      throw new Error("Indique le nom du titulaire du compte (tel qu'il apparaît sur le RIB).");
    }
    const country = (args.country ?? "FR").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new Error("Code pays invalide (deux lettres, ex. FR).");
    }

    const isReplacing = !!profile.bankAccount;
    // Provider provisioning runs in a node action; the row is written by the
    // internal mutation below (status "pending" until the provider verifies).
    await ctx.scheduler.runAfter(0, internal.bankActions.provisionAccount, {
      userId: user._id,
      holderName,
      country,
    });

    // Under-14: request parental consent for the payout feature (once).
    const age = computeAge(profile.birthDate);
    if (age === null || age < 14) {
      const current = profile.bankConsent;
      if (!current || current.status === "declined") {
        const link = await ctx.db
          .query("parentLinks")
          .withIndex("by_teen", (q) => q.eq("teenUserId", user._id))
          .first();
        if (link?.status === "approved") {
          await ctx.db.patch(profile._id, {
            bankConsent: { status: "pending", parentId: link.parentUserId, requestedAt: Date.now() },
          });
          await createNotification(ctx, {
            userId: link.parentUserId,
            type: "parent",
            title: "Autorisation compte bancaire",
            body: `${profile.firstName} souhaite recevoir ses gains sur son propre compte bancaire. Ton autorisation est requise une seule fois.`,
            link: "/portefeuille",
          });
        }
      }
    }

    await logSecurityEvent(ctx, {
      type: isReplacing ? "bank.account_updated" : "bank.account_added",
      severity: "info",
      userId: user._id,
      details: "Compte de virement enregistré (vérification prestataire en cours).",
    });
    return { ok: true };
  },
});

/** Remove the payout destination. Also step-up protected. */
export const removeBankAccount = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") throw new Error("FORBIDDEN");
    const profile = await getProfile(ctx, user._id);
    if (!profile?.bankAccount) throw new Error("Aucun compte bancaire enregistré.");

    await verifyCode(ctx, user._id, args.code.trim());

    await ctx.db.patch(profile._id, {
      bankAccount: undefined,
      bankAccountChangedAt: Date.now(),
    });
    await logSecurityEvent(ctx, {
      type: "bank.account_removed",
      severity: "warning",
      userId: user._id,
      details: "Compte de virement supprimé.",
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Parental consent (feature-level, under-16)
// ---------------------------------------------------------------------------

/** Parent approves or declines a pending consent for one of their teens. */
export const respondBankConsent = mutation({
  args: { teenUserId: v.id("users"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") throw new Error("FORBIDDEN");
    const teenProfile = await getProfile(ctx, args.teenUserId);
    if (!teenProfile) throw new Error("NOT_FOUND");
    const consent = teenProfile.bankConsent;
    if (!consent || consent.status !== "pending") {
      throw new Error("Aucune demande d'autorisation en attente.");
    }
    if (consent.parentId !== user._id) {
      const link = await ctx.db
        .query("parentLinks")
        .withIndex("by_teen", (q) => q.eq("teenUserId", args.teenUserId))
        .first();
      if (!link || link.status !== "approved" || link.parentUserId !== user._id) {
        throw new Error("FORBIDDEN");
      }
    }

    await ctx.db.patch(teenProfile._id, {
      bankConsent: {
        status: args.approve ? "approved" : "declined",
        parentId: user._id,
        requestedAt: consent.requestedAt,
        decidedAt: Date.now(),
      },
    });
    await createNotification(ctx, {
      userId: args.teenUserId,
      type: "parent",
      title: args.approve ? "Autorisation accordée" : "Autorisation refusée",
      body: args.approve
        ? "Ton responsable a autorisé les virements vers ton compte bancaire."
        : "Ton responsable n'a pas autorisé les virements vers ton compte bancaire. Tes gains restent dans ton portefeuille.",
      link: "/portefeuille",
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Internal functions (called by actions / scheduler)
// ---------------------------------------------------------------------------

/** Internal read for the provisioning action. */
export const getBankInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return profile ?? null;
  },
});

/** Persist the provider result — the only place bankAccount is written. */
export const saveBankAccountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    holderName: v.string(),
    country: v.string(),
    stripeAccountId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected")),
    payoutsEnabled: v.boolean(),
    last4: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!profile) return;
    await ctx.db.patch(profile._id, {
      bankAccount: {
        stripeAccountId: args.stripeAccountId ?? "",
        holderName: args.holderName,
        country: args.country,
        status: args.status,
        payoutsEnabled: args.payoutsEnabled,
        last4: args.last4,
        bankName: args.bankName,
        createdAt: Date.now(),
      },
      // Anti-fraud signal for payout holds (24h security delay).
      bankAccountChangedAt: Date.now(),
    });
    await createNotification(ctx, {
      userId: args.userId,
      type: "payment",
      title: "Ton compte bancaire de réception a été modifié.",
      body: "Si tu n'es pas à l'origine de ce changement, change ton mot de passe et contacte le support.",
      link: "/portefeuille",
    });
  },
});

/** Refresh provider verification state (called from the polling action). */
export const markBankVerifiedInternal = internalMutation({
  args: {
    userId: v.id("users"),
    payoutsEnabled: v.boolean(),
    last4: v.optional(v.string()),
    bankName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!profile?.bankAccount) return;
    await ctx.db.patch(profile._id, {
      bankAccount: {
        ...profile.bankAccount,
        status: args.payoutsEnabled ? "verified" : profile.bankAccount.status,
        payoutsEnabled: args.payoutsEnabled,
        last4: args.last4 ?? profile.bankAccount.last4,
        bankName: args.bankName ?? profile.bankAccount.bankName,
        verifiedAt: args.payoutsEnabled ? Date.now() : profile.bankAccount.verifiedAt,
      },
    });
  },
});

void api;
