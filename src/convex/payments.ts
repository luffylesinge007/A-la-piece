import { v } from "convex/values";
import Stripe from "stripe";
import { action, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";
import {
  createNotification,
  creditWallet,
  getOrCreateConversation,
  insertSystemMessage,
  isAdultAccount,
} from "./lib/helpers";
import { computeFee } from "./lib/safety";

const secretKey = process.env.STRIPE_SECRET_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

/** Is real Stripe billing configured? Drives honest UI states everywhere. */
export const isConfigured = query({
  args: {},
  handler: async () => {
    return { configured: !!secretKey };
  },
});

/** Internal: persist the payment record created by the checkout action. */
export const recordPayment = mutation({
  args: {
    bookingId: v.id("bookings"),
    providerRef: v.string(),
    amountCents: v.number(),
    feeCents: v.number(),
    currency: v.string(),
    kind: v.optional(v.union(v.literal("mission"), v.literal("tip"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUserId(ctx);
    if (!user) throw new Error("UNAUTHENTICATED");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("FORBIDDEN");
    // Mission payments are paid by the adult; tips may be sent by either side.
    if (args.kind !== "tip" && booking.adultId !== user) throw new Error("FORBIDDEN");
    const paymentId = await ctx.db.insert("payments", {
      bookingId: args.bookingId,
      payerId: user,
      provider: "stripe",
      providerRef: args.providerRef,
      amountCents: args.amountCents,
      feeCents: args.feeCents,
      currency: args.currency,
      kind: args.kind ?? "mission",
      status: "processing",
      createdAt: Date.now(),
    });
    if (args.kind !== "tip") {
      await ctx.db.patch(args.bookingId, { paymentId });
    }
    return paymentId;
  },
});

/** Internal: webhook confirmed the money — hold it, confirm the booking. */
export const markHeld = mutation({
  args: {
    bookingId: v.id("bookings"),
    providerRef: v.string(),
    /** Stripe PaymentIntent id — kept for refunds and tip reconciliation. */
    providerIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_provider_ref", (q) => q.eq("providerRef", args.providerRef))
      .first();
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status === "held" || payment.status === "released") return;
    await ctx.db.patch(payment._id, {
      status: "held",
      paidAt: Date.now(),
      providerIntentId: args.providerIntentId ?? payment.providerIntentId,
    });

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("BOOKING_NOT_FOUND");
    if (booking.status === "pending") {
      await ctx.db.patch(booking._id, { status: "confirmed", updatedAt: Date.now() });
      const mission = await ctx.db.get(booking.missionId);
      const title = mission?.title ?? "mission";
      const conversationId = await getOrCreateConversation(
        ctx,
        booking.adultId,
        booking.teenId,
        booking.missionId,
        booking._id,
      );
      await insertSystemMessage(
        ctx,
        conversationId,
        "Mission confirmée — le paiement est sécurisé et sera versé après la mission.",
      );
      await createNotification(ctx, {
        userId: booking.teenId,
        type: "payment",
        title: "Mission confirmée",
        body: `« ${title} » — le paiement est sécurisé. Prépare-toi !`,
        link: `/reservations/${booking._id}`,
      });
      await createNotification(ctx, {
        userId: booking.adultId,
        type: "payment",
        title: "Paiement confirmé",
        body: `« ${title} » est réservée. Retrouvez les détails dans vos réservations.`,
        link: `/reservations/${booking._id}`,
      });
    }

    // Tips: the gratuity goes straight to the teen's available balance.
    if (payment.kind === "tip") {
      const booking = await ctx.db.get(payment.bookingId);
      if (booking) {
        const net = payment.amountCents - payment.feeCents;
        await creditWallet(ctx, booking.teenId, "availableCents", net);
        await creditWallet(ctx, booking.teenId, "totalEarnedCents", net);
        await ctx.db.insert("transactions", {
          userId: booking.teenId,
          type: "tip",
          bookingId: booking._id,
          amountCents: net,
          status: "completed",
          description: `Pourboire reçu — ${payment.amountCents / 100} €`,
          createdAt: Date.now(),
        });
        await createNotification(ctx, {
          userId: booking.teenId,
          type: "payment",
          title: "Pourboire reçu",
          body: `${net / 100} € ajoutés à ton solde disponible. Merci !`,
          link: "/portefeuille",
        });
      }
      return;
    }

    void booking;
  },
});

/**
 * Create a real Stripe Checkout Session for a booking.
 * Funds are held by Stripe until the mission is confirmed and released.
 * Requires STRIPE_SECRET_KEY — otherwise returns a clear "not configured" state.
 */
export const createCheckoutSession = action({
  args: { bookingId: v.id("bookings"), origin: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!secretKey) {
      throw new Error(
        "PAYMENT_NOT_CONFIGURED: le paiement sécurisé nécessite une clé Stripe (STRIPE_SECRET_KEY). " +
          "Aucune transaction n'a été créée — configure la clé dans l'onglet Clés API.",
      );
    }
    const user = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("UNAUTHENTICATED: connecte-toi pour payer.");
    if (!isAdultAccount(user)) throw new Error("FORBIDDEN: seul l'adulte qui réserve paie.");
    const booking = await ctx.runQuery(api.bookings.getForPayer, { bookingId: args.bookingId });
    if (!booking) throw new Error("NOT_FOUND: réservation introuvable.");
    if (booking.adultId !== user._id) throw new Error("FORBIDDEN");
    if (booking.paymentStatus === "held" || booking.paymentStatus === "released") {
      throw new Error("Cette réservation est déjà payée.");
    }

    // Origin supplied by the client (validated) — falls back to APP_URL env.
    const originArg = args.origin;
    const origin =
      originArg && /^https?:\/\//.test(originArg) ? originArg.replace(/\/$/, "") : APP_URL;

    const stripe = new Stripe(secretKey);
    const amountCents = Math.round(booking.priceEuros * 100);
    const feeCents = Math.round(computeFee(booking.priceEuros) * 100);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `À LA PIÈCE — ${booking.missionTitle}`,
              description: `Mission réservée à ${booking.teenName}. Fonds sécurisés jusqu'à la confirmation de la mission.`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: args.bookingId,
        missionId: booking.missionId,
        teenId: booking.teenId,
      },
      success_url: `${origin}/reservations/${args.bookingId}?payment=success`,
      cancel_url: `${origin}/reservations/${args.bookingId}?payment=cancelled`,
    });
    // Persist the payment record as "processing" until the webhook confirms it.
    const paymentId: string = await ctx.runMutation(api.payments.recordPayment, {
      bookingId: args.bookingId,
      providerRef: session.id,
      amountCents,
      feeCents,
      currency: "eur",
    });

    return { checkoutUrl: session.url, paymentId };
  },
});

/**
 * Create a real Stripe Checkout Session for an optional tip after a mission.
 * Both parties may tip: the adult thanks the teen, and vice versa.
 */
export const createTipCheckoutSession = action({
  args: { bookingId: v.id("bookings"), amountEuros: v.number(), origin: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!secretKey) {
      throw new Error(
        "PAYMENT_NOT_CONFIGURED: le pourboire nécessite une clé Stripe (STRIPE_SECRET_KEY). " +
          "Aucune transaction n'a été créée.",
      );
    }
    const allowed = [2, 5, 10];
    if (!allowed.includes(args.amountEuros) && (args.amountEuros < 1 || args.amountEuros > 50)) {
      throw new Error("Montant de pourboire invalide (2, 5, 10 € ou montant libre entre 1 et 50 €).");
    }
    const user = await ctx.runQuery(api.users.currentUser);
    if (!user) throw new Error("UNAUTHENTICATED: connecte-toi pour laisser un pourboire.");
    const booking = await ctx.runQuery(api.bookings.getBooking, { bookingId: args.bookingId });
    if (!booking) throw new Error("NOT_FOUND: réservation introuvable.");
    if (booking.status !== "completed") {
      throw new Error("Le pourboire s'envoie une fois la mission terminée.");
    }

    const originArg = args.origin;
    const origin =
      originArg && /^https?:\/\//.test(originArg) ? originArg.replace(/\/$/, "") : APP_URL;

    const stripe = new Stripe(secretKey);
    const amountCents = Math.round(args.amountEuros * 100);
    const feeCents = Math.round(computeFee(args.amountEuros) * 100);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `À LA PIÈCE — Pourboire`,
              description: `Merci pour la mission « ${booking.mission?.title ?? ""} ».`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: args.bookingId,
        kind: "tip",
      },
      success_url: `${origin}/reservations/${args.bookingId}?payment=tip_success`,
      cancel_url: `${origin}/reservations/${args.bookingId}?payment=cancelled`,
    });

    await ctx.runMutation(api.payments.recordPayment, {
      bookingId: args.bookingId,
      providerRef: session.id,
      amountCents,
      feeCents,
      currency: "eur",
      kind: "tip",
    });

    return { checkoutUrl: session.url };
  },
});

/**
 * Stripe webhook: checkout.session.completed → mark payment as HELD.
 * Signature verification requires STRIPE_WEBHOOK_SECRET; without it the
 * endpoint re-fetches the session from Stripe — never trusting raw payloads.
 */
export const handleStripeWebhook = action({
  args: {
    payload: v.string(), // raw body
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    if (!secretKey) {
      throw new Error("PAYMENT_NOT_CONFIGURED");
    }
    const stripe = new Stripe(secretKey);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;
    if (webhookSecret) {
      event = await stripe.webhooks.constructEventAsync(args.payload, args.signature, webhookSecret);
    } else {
      const parsed = JSON.parse(args.payload);
      if (parsed.type !== "checkout.session.completed") {
        return { received: true, ignored: parsed.type };
      }
      const session = await stripe.checkout.sessions.retrieve(parsed.data.object.id);
      if (session.payment_status !== "paid") {
        return { received: true, ignored: "unpaid" };
      }
      event = parsed as Stripe.Event;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) return { received: true, ignored: "no bookingId" };

      // Retrieve the session server-side to get the PaymentIntent id
      // (needed later for refunds / tips reconciliation).
      let intentId: string | undefined;
      try {
        const fresh = await stripe.checkout.sessions.retrieve(session.id);
        if (typeof fresh.payment_intent === "string") intentId = fresh.payment_intent;
      } catch {
        // Keep going without the intent id; refunds fall back to session lookup.
      }

      await ctx.runMutation(api.payments.markHeld, {
        bookingId: bookingId as any,
        providerRef: session.id,
        providerIntentId: intentId,
      });
    }
    return { received: true };
  },
});

/**
 * Release held funds to the teen's wallet after mission confirmation.
 * The Stripe-side capture is already done (Checkout captures immediately);
 * "release" here means our escrow ledger credits the teen's balance.
 */
export const releasePayment = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await getAuthUserId(ctx);
    if (!user) throw new Error("UNAUTHENTICATED");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("NOT_FOUND");
    if (booking.adultId !== user) throw new Error("FORBIDDEN");
    if (booking.status !== "completed") {
      throw new Error("La mission doit être terminée et confirmée avant le paiement.");
    }
    if (!booking.paymentId) throw new Error("NO_PAYMENT");
    const payment = await ctx.db.get(booking.paymentId);
    if (payment && payment.status === "held") {
      const teenShare = payment.amountCents - payment.feeCents;
      await ctx.db.patch(payment._id, { status: "released", releasedAt: Date.now() });
      await creditWallet(ctx, booking.teenId, "availableCents", teenShare);
      await creditWallet(ctx, booking.teenId, "totalEarnedCents", teenShare);
      await ctx.db.insert("transactions", {
        userId: booking.teenId,
        type: "mission_payment",
        bookingId: booking._id,
        amountCents: teenShare,
        status: "completed",
        description: `Mission payée — ${payment.amountCents / 100} € reçus (frais plateforme déduits)`,
        createdAt: Date.now(),
      });
      await ctx.db.insert("transactions", {
        userId: booking.adultId,
        type: "mission_payment",
        bookingId: booking._id,
        amountCents: -payment.amountCents,
        status: "completed",
        description: `Paiement mission — ${payment.amountCents / 100} € débités`,
        createdAt: Date.now(),
      });
      await createNotification(ctx, {
        userId: booking.teenId,
        type: "payment",
        title: "Paiement reçu !",
        body: `${teenShare / 100} € sont disponibles dans ton portefeuille.`,
        link: "/portefeuille",
      });
    }
  },
});

/**
 * Refund the adult when a booking is cancelled before completion.
 * With Stripe configured this issues a REAL Stripe refund on the original
 * PaymentIntent; without it the ledger reflects the refund locally only.
 */
export const refundPayment = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await getAuthUserId(ctx);
    if (!user) throw new Error("UNAUTHENTICATED");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("NOT_FOUND");
    if (booking.adultId !== user && booking.teenId !== user) throw new Error("FORBIDDEN");
    if (booking.paymentId) {
      const payment = await ctx.db.get(booking.paymentId);
      if (payment && payment.status === "held") {
        // Schedule the real Stripe refund as an action (network I/O is not
        // allowed inside mutations).
        await ctx.scheduler.runAfter(0, api.payments.executeRefund, {
          paymentId: payment._id,
        });
      }
    }
  },
});

/** Internal read for the refund action. */
export const getPaymentInternal = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.paymentId);
  },
});

/** Issue the real Stripe refund; on failure mark the payment failed so admins see it. */
export const executeRefund = action({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const payment = await ctx.runQuery(api.payments.getPaymentInternal, {
      paymentId: args.paymentId,
    });
    if (!payment || payment.status !== "held") return { refunded: false as const };

    if (!secretKey) {
      // Ledger-only mode (no Stripe on this environment): record the refund
      // locally so the adult's history stays truthful.
      await ctx.runMutation(api.payments.markRefunded, {
        paymentId: args.paymentId,
        providerRefundId: undefined,
      });
      return { refunded: true as const, local: true };
    }

    const stripe = new Stripe(secretKey);
    try {
      let intentId = payment.providerIntentId;
      if (!intentId) {
        // Fallback: resolve the PaymentIntent from the Checkout Session.
        const session = await stripe.checkout.sessions.retrieve(payment.providerRef);
        if (typeof session.payment_intent === "string") intentId = session.payment_intent;
      }
      if (!intentId) throw new Error("PaymentIntent introuvable pour cette session.");
      const refund = await stripe.refunds.create({
        payment_intent: intentId,
        metadata: { bookingId: String(payment.bookingId), source: "alp-cancellation" },
      });
      await ctx.runMutation(api.payments.markRefunded, {
        paymentId: args.paymentId,
        providerRefundId: refund.id,
      });
      return { refunded: true as const };
    } catch (error) {
      await ctx.runMutation(api.payments.markRefundFailed, {
        paymentId: args.paymentId,
        reason: error instanceof Error ? error.message : "Erreur Stripe inconnue.",
      });
      return { refunded: false as const };
    }
  },
});

/** Refund accepted by Stripe: finalize the ledger. */
export const markRefunded = mutation({
  args: { paymentId: v.id("payments"), providerRefundId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status !== "held") return;
    await ctx.db.patch(payment._id, { status: "refunded" });
    const booking = await ctx.db.get(payment.bookingId);
    if (!booking) return;
    const now = Date.now();
    await ctx.db.insert("transactions", {
      userId: booking.adultId,
      type: "refund",
      bookingId: booking._id,
      amountCents: payment.amountCents,
      status: "completed",
      description:
        args.providerRefundId
          ? "Remboursement Stripe — réservation annulée"
          : "Remboursement — réservation annulée",
      createdAt: now,
    });
    await createNotification(ctx, {
      userId: booking.adultId,
      type: "payment",
      title: "Remboursement effectué",
      body: `${payment.amountCents / 100} € remboursés sur ta réservation annulée.`,
      link: "/portefeuille",
    });
  },
});

/** Stripe refused the refund — keep the funds visible as "held" + alert. */
export const markRefundFailed = mutation({
  args: { paymentId: v.id("payments"), reason: v.string() },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return;
    const booking = await ctx.db.get(payment.bookingId);
    if (!booking) return;
    await ctx.db.patch(payment._id, { status: "failed" });
    await ctx.db.insert("transactions", {
      userId: booking.adultId,
      type: "refund",
      bookingId: booking._id,
      amountCents: 0,
      status: "failed",
      description: "Remboursement impossible — notre équipe a été alertée",
      createdAt: Date.now(),
    });
    await ctx.db.insert("adminActions", {
      adminId: booking.adultId, // system actor — traced to the paying adult
      action: "payment.refund_failed",
      targetType: "payment",
      targetId: args.paymentId,
      details: args.reason,
      createdAt: Date.now(),
    });
  },
});
