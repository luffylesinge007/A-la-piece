"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Stripe from "stripe";
import axios from "axios";

/**
 * Node runtime actions for the teen bank account (spec #43).
 *
 * Network I/O lives here: Stripe Connect Express provisioning + onboarding
 * links, verification refresh, and the step-up code email. All database
 * writes go through internal mutations in bank.ts.
 */

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;

/** Send the step-up code by email (same regulated channel as auth OTP). */
export const sendChangeCodeEmail = internalAction({
  args: { email: v.string(), code: v.string() },
  handler: async (_ctx, args) => {
    if (!EMAIL_API_KEY) {
      // No mail provider configured: fail loudly rather than silently gating
      // the user out — the code row exists but was never delivered.
      throw new Error(
        "Envoi email indisponible (EMAIL_API_KEY absente) — impossible de vérifier le changement.",
      );
    }
    await axios.post(
      "https://auth.freebuff.app/send_otp",
      {
        to: args.email,
        otp: args.code,
        appName: "À LA PIÈCE — vérification compte bancaire",
      },
      { headers: { "x-api-key": EMAIL_API_KEY }, timeout: 10_000 },
    );
    return { sent: true };
  },
});

/**
 * Provision a Stripe Connect Express account for the teen.
 * The bank details themselves are collected by Stripe's hosted onboarding —
 * they never transit through our servers. Status starts "pending" until the
 * refresh action confirms payouts are enabled.
 */
export const provisionAccount = internalAction({
  args: {
    userId: v.id("users"),
    holderName: v.string(),
    country: v.string(),
  },
  handler: async (ctx, args) => {
    let stripeAccountId: string | undefined;
    if (stripe) {
      try {
        const account = await stripe.accounts.create({
          type: "express",
          country: args.country,
          email: undefined, // filled by Stripe onboarding
          capabilities: { transfers: { requested: true } },
          business_type: "individual",
          business_profile: { name: "À LA PIÈCE — gains de missions" },
          metadata: { userId: args.userId, product: "alp_teen_payout" },
          tos_acceptance: { service_agreement: "recipient" },
        });
        stripeAccountId = account.id;
      } catch {
        // Provider unreachable/unconfigured: keep an honest "pending" row so
        // the UI can explain and the user can retry.
        stripeAccountId = undefined;
      }
    }
    await ctx.runMutation(internal.bank.saveBankAccountInternal, {
      userId: args.userId,
      holderName: args.holderName,
      country: args.country,
      stripeAccountId,
      status: "pending",
      payoutsEnabled: false,
    });
    return { provisioned: !!stripeAccountId };
  },
});

/**
 * Fresh single-use Stripe onboarding link. Called when the teen clicks
 * "Terminer la configuration" — links expire, so they are never stored.
 */
export const createOnboardingLink = action({
  args: {},
  handler: async (ctx) => {
    const user: any = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("UNAUTHENTICATED");
    if (user.accountType !== "teen") throw new Error("FORBIDDEN");
    const profile: any = await ctx.runQuery(internal.bank.getBankInternal, {
      userId: user._id,
    });
    const accountId = profile?.bankAccount?.stripeAccountId;
    if (!stripe) {
      throw new Error(
        "Paiement non configuré (STRIPE_SECRET_KEY absente) — la configuration du compte bancaire sera disponible dès l'activation.",
      );
    }
    if (!accountId || !accountId.startsWith("acct_")) {
      throw new Error(
        "La création du compte chez notre prestataire n'est pas encore terminée — réessaie dans un instant.",
      );
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/portefeuille?bank=refresh`,
      return_url: `${APP_URL}/portefeuille?bank=done`,
      type: "account_onboarding",
    });
    return { url: link.url };
  },
});

/**
 * Re-check provider verification (payouts enabled, external account).
 * Called from the wallet UI after onboarding returns to the app.
 */
export const refreshBankStatus = action({
  args: {},
  handler: async (ctx) => {
    const user: any = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("UNAUTHENTICATED");
    if (user.accountType !== "teen") throw new Error("FORBIDDEN");
    const profile: any = await ctx.runQuery(internal.bank.getBankInternal, {
      userId: user._id,
    });
    const account = profile?.bankAccount;
    if (!account?.stripeAccountId || !stripe) return { updated: false };

    const acct = await stripe.accounts.retrieve(account.stripeAccountId);
    const payoutsEnabled = !!acct.payouts_enabled;
    // Individual accounts: the external account is a card-less bank account.
    let last4: string | undefined;
    let bankName: string | undefined;
    try {
      const ext = acct.external_accounts?.data?.[0] as any;
      if (ext?.last4) last4 = ext.last4;
      if (ext?.bank_name) bankName = ext.bank_name;
    } catch {
      // keep display data optional
    }
    await ctx.runMutation(internal.bank.markBankVerifiedInternal, {
      userId: user._id,
      payoutsEnabled,
      last4,
      bankName,
    });
    return { updated: true, payoutsEnabled };
  },
});
