import { v } from "convex/values";
import Stripe from "stripe";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { createNotification, creditWallet, getProfile, requireUser } from "./lib/helpers";
import { computeAge } from "./lib/safety";
import { evaluatePayoutRisk } from "./lib/payoutRisk";
import { logSecurityEvent, SECURITY_EVENTS } from "./lib/security";

const secretKey = process.env.STRIPE_SECRET_KEY;

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

// ---------------------------------------------------------------------------
// Withdrawals — teen requests, guardian approves, money moves via Stripe
// ---------------------------------------------------------------------------

/** Is real Stripe connected-account payout configured? Drives honest UI states. */
export const payoutConfigured = query({
  args: {},
  handler: async () => {
    return { configured: !!secretKey };
  },
});

/** My withdrawal requests (teen view). */
export const myWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
  },
});

/** Pending withdrawal requests for the teens linked to the current parent. */
export const guardianWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") return [];
    const profile = await getProfile(ctx, user._id);
    const teenIds = profile?.linkedTeenIds ?? [];
    const result = [];
    for (const teenId of teenIds) {
      const rows = await ctx.db
        .query("withdrawals")
        .withIndex("by_user", (q) => q.eq("userId", teenId))
        .order("desc")
        .take(20);
      const teenProfile = await getProfile(ctx, teenId);
      for (const w of rows) {
        if (w.status === "requested" || w.status === "approved") {
          result.push({
            _id: w._id,
            teenId,
            teenName: teenProfile?.firstName ?? "Adolescent",
            amountCents: w.amountCents,
            status: w.status,
            requestedAt: w.requestedAt,
          });
        }
      }
    }
    return result;
  },
});

/**
 * Teen requests a withdrawal of (part of) their available balance.
 * The money is locked immediately: moved out of `availableCents` while the
 * request is pending, and fully refunded if the request is rejected or fails.
 *
 * Destination (spec #43): the teen's OWN verified bank account by default;
 * the guardian's account stays available as a fallback choice. Parental
 * approval is required once for the bank-account feature when the provider's
 * rules demand it (under-16) — never per payout.
 */
export const requestWithdrawal = mutation({
  args: { amountCents: v.number(), destination: v.optional(v.union(v.literal("own_bank"), v.literal("guardian"))), bookingId: v.optional(v.id("bookings")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") {
      throw new Error("FORBIDDEN: le retrait concerne les comptes adolescents.");
    }
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
      throw new Error("Montant invalide.");
    }
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const available = wallet?.availableCents ?? 0;
    if (args.amountCents > available) {
      throw new Error("Solde insuffisant : tu ne peux retirer que ton solde disponible.");
    }
    // An approved-but-unpaid request must not be duplicated.
    const open = await ctx.db
      .query("withdrawals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (open && (open.status === "requested" || open.status === "approved" || open.status === "on_hold")) {
      throw new Error("Une demande de retrait est déjà en cours.");
    }

    const profile = await getProfile(ctx, user._id);
    const bank = profile?.bankAccount;
    const age = computeAge(profile?.birthDate);
    const needsConsent = age === null || age < 16;
    const consentOk = !needsConsent || profile?.bankConsent?.status === "approved";

    const destination = args.destination ?? (bank ? "own_bank" : "guardian");

    // Resolve the payout destination and its readiness.
    let guardianId: any = undefined;
    let payoutStripeAccountId: string | undefined = undefined;
    const link = await ctx.db
      .query("parentLinks")
      .withIndex("by_teen", (q) => q.eq("teenUserId", user._id))
      .first();
    if (link?.status === "approved") {
      guardianId = link.parentUserId;
      const guardianProfile = await getProfile(ctx, link.parentUserId);
      if (guardianProfile?.verifiedPayment) {
        payoutStripeAccountId = guardianProfile.payoutStripeAccountId;
      }
    }

    let destAccountId: string | undefined;
    let holdReasons: string[] = [];
    if (destination === "own_bank") {
      if (!bank) {
        throw new Error(
          "Aucun compte bancaire enregistré. Ajoute d'abord ton compte dans « Mon argent ».",
        );
      }
      if (!consentOk) {
        throw new Error(
          "L'autorisation de ton responsable est requise pour les virements vers ton compte bancaire.",
        );
      }
      if (!bank.payoutsEnabled || bank.status !== "verified") {
        throw new Error(
          "Ton compte bancaire attend la vérification du prestataire de paiement — réessaie bientôt.",
        );
      }
      destAccountId = bank.stripeAccountId;
      // Anti-fraud gate (spec #43 §6): park the payout, never block the money.
      const failed = await ctx.db
        .query("withdrawals")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(5);
      const recentFailed = failed.filter(
        (w) => w.status === "failed" && (Date.now() - (w.paidAt ?? w.requestedAt)) < 30 * 86_400_000,
      ).length;
      const risk = evaluatePayoutRisk({
        amountCents: args.amountCents,
        accountCountry: bank.country,
        bankAccountChangedAt: profile?.bankAccountChangedAt,
        recentFailedPayouts: recentFailed,
      });
      holdReasons = risk.reasons;
    } else {
      if (!payoutStripeAccountId) {
        throw new Error(
          "Le compte de virement de ton responsable n'est pas encore connecté — choisis ton compte bancaire ou attends sa configuration.",
        );
      }
      destAccountId = payoutStripeAccountId;
    }

    // Lock the funds out of the available balance while pending.
    await creditWallet(ctx, user._id, "availableCents", -args.amountCents);

    const onHold = holdReasons.length > 0;
    const id = await ctx.db.insert("withdrawals", {
      userId: user._id,
      guardianId: destination === "own_bank" ? undefined : guardianId,
      amountCents: args.amountCents,
      status: onHold ? "on_hold" : "requested",
      destination,
      bookingId: args.bookingId,
      onHold,
      holdReason: onHold ? holdReasons.join(" · ") : undefined,
      payoutStripeAccountId: destAccountId,
      requestedAt: Date.now(),
    });

    if (onHold) {
      await logSecurityEvent(ctx, {
        type: "payout.hold",
        severity: "warning",
        userId: user._id,
        targetType: "withdrawal",
        targetId: id,
        details: `Virement mis en attente — ${holdReasons.join(" · ")}`,
      });
    }

    await ctx.db.insert("transactions", {
      userId: user._id,
      type: "withdrawal",
      amountCents: 0, // net zero: available → locked, until paid/rejected
      status: "pending",
      description:
        destination === "own_bank"
          ? onHold
            ? "Virement en vérification — en attente de notre équipe"
            : "Virement vers ton compte bancaire — en cours"
          : "Demande de retrait — en attente de validation du responsable",
      createdAt: Date.now(),
    });

    if (destination === "own_bank" && !onHold) {
      // Own-bank payouts move directly — no guardian approval needed (spec).
      // The success/failure notification is sent by the payout internal flow.
      await ctx.scheduler.runAfter(0, internal.wallet.executePayout, { withdrawalId: id });
    } else if (destination === "own_bank" && onHold) {
      await createNotification(ctx, {
        userId: user._id,
        type: "payment",
        title: "Virement en vérification",
        body: `Ton paiement de ${args.amountCents / 100} € est temporairement en attente d'une vérification supplémentaire. Rien n'est perdu — il repart dès que la vérification est faite.`,
        link: "/portefeuille",
      });
    } else if (guardianId) {
      const myProfile = await getProfile(ctx, user._id);
      await createNotification(ctx, {
        userId: guardianId,
        type: "payment",
        title: "Demande de retrait",
        body: `${myProfile?.firstName ?? "Ton ado"} souhaite virer ${args.amountCents / 100} € vers ton compte.`,
        link: "/portefeuille",
      });
    }
    return id;
  },
});

/** Guardian approves (or rejects) a pending withdrawal. */
export const respondWithdrawal = mutation({
  args: { withdrawalId: v.id("withdrawals"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (!w) throw new Error("NOT_FOUND: demande introuvable.");
    if (w.status !== "requested") throw new Error("Cette demande a déjà été traitée.");

    // The approving adult is the linked guardian — or the requester themselves
    // when they are of age. Teens can never self-approve.
    const link = await ctx.db
      .query("parentLinks")
      .withIndex("by_teen", (q) => q.eq("teenUserId", w.userId))
      .first();
    const isGuardian = !!link && link.status === "approved" && link.parentUserId === user._id;
    const requester = await ctx.db.get(w.userId);
    const isSelfAdult = requester?.accountType !== "teen" && requester?._id === user._id;
    if (!isGuardian && !isSelfAdult) {
      throw new Error("FORBIDDEN: seul le responsable légal peut valider ce retrait.");
    }

    if (!args.approve) {
      // Refund the locked amount to the available balance.
      await creditWallet(ctx, w.userId, "availableCents", w.amountCents);
      await ctx.db.patch(w._id, { status: "rejected", decidedAt: Date.now() });
      await ctx.db.insert("transactions", {
        userId: w.userId,
        type: "withdrawal",
        amountCents: 0,
        status: "refunded",
        description: "Retrait refusé — montant remis dans ton solde disponible",
        createdAt: Date.now(),
      });
      await createNotification(ctx, {
        userId: w.userId,
        type: "payment",
        title: "Retrait refusé",
        body: `${w.amountCents / 100} € ont été remis dans ton solde disponible.`,
        link: "/portefeuille",
      });
      return { status: "rejected" as const };
    }

    await ctx.db.patch(w._id, { status: "approved", decidedAt: Date.now() });

    // Real payout when Stripe is configured and a destination is known.
    if (secretKey && w.payoutStripeAccountId) {
      await ctx.scheduler.runAfter(0, internal.wallet.executePayout, { withdrawalId: w._id });
    }

    await createNotification(ctx, {
      userId: w.userId,
      type: "payment",
      title: secretKey && w.payoutStripeAccountId ? "Retrait approuvé" : "Retrait approuvé",
      body:
        secretKey && w.payoutStripeAccountId
          ? `${w.amountCents / 100} € seront virés sous peu.`
          : `Demande validée. Le virement se fera dès que le compte de virement du responsable sera connecté.`,
      link: "/portefeuille",
    });
    return { status: "approved" as const };
  },
});

/**
 * Execute the real Stripe transfer to the destination account — the teen's
 * own bank (spec #43) or the guardian's connected account. Runs in a
 * scheduled action so Stripe latency never blocks the mutation.
 */
export const executePayout = internalAction({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    if (!secretKey) {
      await ctx.runMutation(internal.wallet.failPayout, {
        withdrawalId: args.withdrawalId,
        reason: "Paiement non configuré (STRIPE_SECRET_KEY absente).",
      });
      return { paid: false as const };
    }
    const w = await ctx.runQuery(internal.wallet.getWithdrawalInternal, {
      withdrawalId: args.withdrawalId,
    });
    if (!w || !(w.status === "approved" || w.status === "requested")) return { paid: false as const };
    if (!w.payoutStripeAccountId || !w.payoutStripeAccountId.startsWith("acct_")) {
      await ctx.runMutation(internal.wallet.failPayout, {
        withdrawalId: args.withdrawalId,
        reason:
          w.destination === "own_bank"
            ? "Le compte bancaire n'a pas encore été vérifié par le prestataire de paiement."
            : "Aucun compte de virement enregistré pour le responsable.",
      });
      return { paid: false as const };
    }
    try {
      const stripe = new Stripe(secretKey);
      const transfer = await stripe.transfers.create({
        amount: w.amountCents,
        currency: "eur",
        destination: w.payoutStripeAccountId,
        description:
          w.destination === "own_bank"
            ? "À LA PIÈCE — virement des gains vers le compte bancaire de l'adolescent"
            : "À LA PIÈCE — retrait gains adolescent (via responsable légal)",
        metadata: { withdrawalId: args.withdrawalId, teenId: w.userId, destination: w.destination ?? "guardian" },
      });
      await ctx.runMutation(internal.wallet.markPayoutPaid, {
        withdrawalId: args.withdrawalId,
        providerRef: transfer.id,
      });
      return { paid: true as const, transferId: transfer.id };
    } catch (error) {
      await ctx.runMutation(internal.wallet.failPayout, {
        withdrawalId: args.withdrawalId,
        reason: error instanceof Error ? error.message : "Erreur Stripe inconnue.",
      });
      return { paid: false as const };
    }
  },
});

/** Internal read for the payout action. */
export const getWithdrawalInternal = internalQuery({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.withdrawalId);
  },
});

/** Payout succeeded: finalize balances and transactions. */
export const markPayoutPaid = internalMutation({
  args: { withdrawalId: v.id("withdrawals"), providerRef: v.string() },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.withdrawalId);
    if (!w || !(w.status === "approved" || w.status === "requested")) return;
    await ctx.db.patch(w._id, { status: "paid", paidAt: Date.now(), providerRef: args.providerRef });
    await creditWallet(ctx, w.userId, "availableCents", 0); // no-op, keeps wallet row alive
    await ctx.db.insert("transactions", {
      userId: w.userId,
      type: "payout_transfer",
      amountCents: -w.amountCents,
      status: "completed",
      description:
        w.destination === "own_bank"
          ? `Virement effectué — ${w.amountCents / 100} € envoyés sur ton compte bancaire`
          : `Virement effectué — ${w.amountCents / 100} € envoyés au compte du responsable`,
      createdAt: Date.now(),
    });
    await createNotification(ctx, {
      userId: w.userId,
      type: "payment",
      title: "Ton paiement a été envoyé vers ton compte bancaire.",
      body: `${w.amountCents / 100} € — arrivée sous 1 à 2 jours ouvrés selon ta banque.`,
      link: "/portefeuille",
    });
  },
});

/** Payout failed: refund the locked amount so the teen never loses money. */
export const failPayout = internalMutation({
  args: { withdrawalId: v.id("withdrawals"), reason: v.string() },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.withdrawalId);
    if (!w || !(w.status === "approved" || w.status === "requested")) return;
    await creditWallet(ctx, w.userId, "availableCents", w.amountCents);
    await ctx.db.patch(w._id, { status: "failed", failureReason: args.reason });
    await ctx.db.insert("transactions", {
      userId: w.userId,
      type: "withdrawal",
      amountCents: 0,
      status: "failed",
      description: "Virement impossible — montant remis dans ton solde disponible",
      createdAt: Date.now(),
    });
    // Spec #43 §5: clear failure notification, never any bank data in it.
    await createNotification(ctx, {
      userId: w.userId,
      type: "payment",
      title: "Ton paiement n'a pas pu être envoyé.",
      body: "Vérifie ton compte bancaire ou les informations demandées — le montant est de retour dans ton solde disponible.",
      link: "/portefeuille",
    });
  },
});

/**
 * Moderation decision on a held payout (spec #43 §6).
 * approve=true → resume the transfer; approve=false → refund the balance.
 * The money is never blocked indefinitely and there is always a resolution path.
 */
export const resolveHeldPayout = mutation({
  args: { withdrawalId: v.id("withdrawals"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "admin" && user.accountType !== "moderator") {
      throw new Error("FORBIDDEN");
    }
    const w = await ctx.db.get(args.withdrawalId);
    if (!w || w.status !== "on_hold") throw new Error("NOT_FOUND");

    if (!args.approve) {
      await creditWallet(ctx, w.userId, "availableCents", w.amountCents);
      await ctx.db.patch(w._id, { status: "failed", onHold: false, failureReason: "Refusé après vérification — montant restitué" });
      await ctx.db.insert("transactions", {
        userId: w.userId,
        type: "withdrawal",
        amountCents: 0,
        status: "refunded",
        description: "Virement refusé après vérification — montant remis dans ton solde disponible",
        createdAt: Date.now(),
      });
      await createNotification(ctx, {
        userId: w.userId,
        type: "payment",
        title: "Virement vérifié — montant restitué",
        body: "Après vérification, le virement n'a pas été autorisé. Le montant est de retour dans ton solde disponible. Contacte le support pour plus de détails.",
        link: "/portefeuille",
      });
      return { resolved: true as const, refunded: true as const };
    }

    await ctx.db.patch(w._id, { status: "approved", onHold: false });
    await ctx.scheduler.runAfter(0, internal.wallet.executePayout, { withdrawalId: w._id });
    await createNotification(ctx, {
      userId: w.userId,
      type: "payment",
      title: "Virement vérifié — il repart",
      body: `Ton paiement de ${w.amountCents / 100} € a été validé et part vers ton compte bancaire.`,
      link: "/portefeuille",
    });
    await logSecurityEvent(ctx, {
      type: "payout.hold_resolved",
      severity: "info",
      userId: user._id,
      targetType: "withdrawal",
      targetId: w._id,
      details: args.approve ? "Virement autorisé après vérification." : "Virement refusé, montant restitué.",
    });
    return { resolved: true as const, refunded: false as const };
  },
});

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

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
