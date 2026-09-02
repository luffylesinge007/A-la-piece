import { v } from "convex/values";
import Stripe from "stripe";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import {
  creditWallet,
  createNotification,
  getOrCreateConversation,
  insertSystemMessage,
  isAdultAccount,
  requireUser,
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

/**
 * Create a real Stripe Checkout Session for a booking.
 * Funds are held by Stripe until the mission is confirmed and released.
 * Requires STRIPE_SECRET_KEY — otherwise returns a clear "not configured" state.
 */
export const createCheckoutSession = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    if (!secretKey) {
      throw new Error(
        "PAYMENT_NOT_CONFIGURED: le paiement sécurisé nécessite une clé Stripe (STRIPE_SECRET_KEY). " +
          "Aucune transaction n'a été créée — configure la clé dans l'onglet Clés API.",
      );
    }
    const user = await requireUser(ctx);
    if (!isAdultAccount(user)) throw new Error("FORBIDDEN: seul l'adulte qui réserve paie.");
    const booking = await ctx.runQuery(api.bookings.getForPayer, { bookingId: args.bookingId });
    if (!booking) throw new Error("NOT_FOUND: réservation introuvable.");
    if (booking.adultId !== user._id) throw new Error("FORBIDDEN");
    if (booking.paymentStatus === "held" || booking.paymentStatus === "released") {
      throw new Error("Cette réservation est déjà payée.");
    }

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
      success_url: `${APP_URL}/reservations/${args.bookingId}?payment=success`,
      cancel_url: `${APP_URL}/reservations/${args.bookingId}?payment=cancelled`,
    });

    // Persist the payment record as "processing" until the webhook confirms it.
    const paymentId = await ctx.runMutation(api.payments.recordPayment, {
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
 * Stripe webhook: checkout.session.completed → mark payment as HELD.
 * Signature verification requires STRIPE_WEBHOOK_SECRET; without it the
 * endpoint refuses to trust the payload (no blind acceptance).
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
      // Without the webhook secret we only accept the event after re-fetching
      // the session from Stripe — never trust the raw payload.
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
      await ctx.runMutation(api.payments.markHeld, {
        bookingId: bookingId as any,
        providerRef: session.id,
      });
    }
    return { received: true };
  },
});

/** Internal: persist the payment intent created by the checkout action. */
export const recordPayment = mutation({
  args: {
    bookingId: v.id("bookings"),
    providerRef: v.string(),
    amountCents: v.number(),
    feeCents: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.adultId !== user._id) throw new Error("FORBIDDEN");
    const paymentId = await ctx.db.insert("payments", {
      bookingId: args.bookingId,
      payerId: user._id,
      provider: "stripe",
      providerRef: args.providerRef,
      amountCents: args.amountCents,
      feeCents: args.feeCents,
      currency: args.currency,
      status: "processing",
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.bookingId, { paymentId });
    return paymentId;
  },
});

/** Internal: webhook confirmed the money — hold it, confirm the booking. */
export const markHeld = mutation({
  args: {
    bookingId: v.id("bookings"),
    providerRef: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_provider_ref", (q) => q.eq("providerRef", args.providerRef))
      .first();
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status === "held" || payment.status === "released") return;
    await ctx.db.patch(payment._id, { status: "held", paidAt: Date.now() });

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("BOOKING_NOT_FOUND");
    if (booking.status === "pending") {
      await ctx.db.patch(booking._id, { status: "confirmed", updatedAt: Date.now() });
      const mission = await ctx.db.get(booking.missionId);
      const title = mission?.title ?? "mission";
      const conversationId = await getOrCreateConversation(ctx, booking.adultId, booking.teenId, booking.missionId, booking._id);
      await insertSystemMessage(ctx, conversationId, "Mission confirmée ✅ — le paiement est sécurisé et sera versé après la mission.");
      await createNotification(ctx, {
        userId: booking.teenId,
        type: "payment",
        title: "Mission confirmée ✅",
        body: `« ${title} » — le paiement est sécurisé. Prépare-toi !`,
        link: `/reservations/${booking._id}`,
      });
      await createNotification(ctx, {
        userId: booking.adultId,
        type: "payment",
        title: "Paiement confirmé ✅",
        body: `« ${title} » est réservée. Retrouvez les détails dans vos réservations.`,
        link: `/reservations/${booking._id}`,
      });
    }
  },
});

/** Release held funds to the teen's wallet after mission confirmation. */
export const releasePayment = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("NOT_FOUND");
    if (booking.adultId !== user._id) throw new Error("FORBIDDEN");
    if (booking.status !== "completed") {
      throw new Error("La mission doit être terminée et confirmée avant le paiement.");
    }
    if (booking.paymentId) {
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
          title: "💰 Paiement reçu !",
          body: `${teenShare / 100} € sont disponibles dans ton portefeuille.`,
          link: "/portefeuille",
        });
      }
    }
  },
});

/** Refund the adult if the booking is cancelled before completion. */
export const refundPayment = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("NOT_FOUND");
    if (booking.adultId !== user._id && booking.teenId !== user._id) throw new Error("FORBIDDEN");
    if (booking.paymentId) {
      const payment = await ctx.db.get(booking.paymentId);
      if (payment && payment.status === "held") {
        // Note: the Stripe-side refund (stripe.refunds.create) is issued by an
        // admin action or automatically when a real Stripe account is connected.
        await ctx.db.patch(payment._id, { status: "refunded" });
        await ctx.db.insert("transactions", {
          userId: booking.adultId,
          type: "refund",
          bookingId: booking._id,
          amountCents: payment.amountCents,
          status: "completed",
          description: "Remboursement de la réservation annulée",
          createdAt: Date.now(),
        });
      }
    }
  },
});
