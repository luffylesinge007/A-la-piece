import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  createNotification,
  getOrCreateConversation,
  getProfile,
  insertSystemMessage,
  requireUser,
} from "./lib/helpers";
import { requireActiveAccount } from "./lib/security";

function statusFlowMessage(status: string): string | null {
  switch (status) {
    case "confirmed":
      return "Mission confirmée";
    case "in_progress":
      return "La mission a commencé";
    case "completed":
      return "Mission terminée";
    default:
      return null;
  }
}

/** Bookings for the current user (teen or adult) with mission + counterpart info. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const asTeen = await ctx.db
      .query("bookings")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .order("desc")
      .collect();
    const asAdult = await ctx.db
      .query("bookings")
      .withIndex("by_adult", (q) => q.eq("adultId", user._id))
      .order("desc")
      .collect();
    const all = [...asTeen, ...asAdult].sort((a, b) => b.createdAt - a.createdAt);

    const result = [];
    for (const b of all) {
      const mission = await ctx.db.get(b.missionId);
      const payment = b.paymentId ? await ctx.db.get(b.paymentId) : null;
      const counterpartId = b.teenId === user._id ? b.adultId : b.teenId;
      const counterpart = await getProfile(ctx, counterpartId);
      result.push({
        _id: b._id,
        role: b.teenId === user._id ? "teen" : "adult",
        status: b.status,
        priceEuros: b.priceEuros,
        paymentStatus: payment?.status ?? null,
        checkInAt: b.checkInAt,
        checkOutAt: b.checkOutAt,
        // Security: the PIN is the ADULT's secret, shared verbally at check-in.
        // Never sent to the teen's client.
        pinCode: b.adultId === user._id && (b.status === "confirmed" || b.status === "in_progress")
          ? b.pinCode
          : undefined,
        mission: mission
          ? {
              _id: mission._id,
              title: mission.title,
              scheduledDate: mission.scheduledDate,
              scheduledTime: mission.scheduledTime,
              durationMin: mission.durationMin,
              area: mission.area,
              city: mission.city,
              categorySlug: mission.categorySlug,
            }
          : null,
        counterpart: counterpart
          ? { firstName: counterpart.firstName, avatarIcon: counterpart.avatarIcon }
          : null,
      });
    }
    return result;
  },
});

/** Booking detail with access control (both parties only). */
export const getBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    if (b.teenId !== user._id && b.adultId !== user._id) return null;
    const mission = await ctx.db.get(b.missionId);
    const payment = b.paymentId ? await ctx.db.get(b.paymentId) : null;
    const isTeen = b.teenId === user._id;
    const counterpart = await getProfile(ctx, isTeen ? b.adultId : b.teenId);

    // PIN: the ADULT's secret. It is shared verbally by the adult at check-in
    // so the teen can prove they are on site. Never displayed to the teen.
    const pinVisible = !isTeen && (b.status === "confirmed" || b.status === "in_progress") && b.pinCode !== undefined;

    return {
      _id: b._id,
      role: isTeen ? "teen" : "adult",
      status: b.status,
      priceEuros: b.priceEuros,
      checkInAt: b.checkInAt,
      checkOutAt: b.checkOutAt,
      teenConfirmed: b.teenConfirmed ?? false,
      pinCode: pinVisible ? b.pinCode : undefined,
      requiresPin: mission?.requiresPin ?? false,
      payment: payment
        ? { status: payment.status, amountCents: payment.amountCents, feeCents: payment.feeCents }
        : null,
      mission: mission
        ? {
            _id: mission._id,
            title: mission.title,
            description: mission.description,
            scheduledDate: mission.scheduledDate,
            scheduledTime: mission.scheduledTime,
            durationMin: mission.durationMin,
            area: mission.area,
            city: mission.city,
            // Precise address: revealed to the confirmed teen (safety rule).
            exactAddress: isTeen || b.adultId === user._id ? mission.exactAddress ?? null : null,
            safetyNotes: mission.safetyNotes,
            equipment: mission.equipment,
          }
        : null,
      counterpart: counterpart
        ? {
            firstName: counterpart.firstName,
            avatarIcon: counterpart.avatarIcon,
            city: counterpart.city,
            verifiedEmail: counterpart.verifiedEmail ?? false,
            verifiedPhone: counterpart.verifiedPhone ?? false,
          }
        : null,
    };
  },
});

/**
 * Internal read used by the checkout action (payments module).
 * `internalQuery` — the platform forbids direct client calls.
 */
export const getForPayer = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    const mission = await ctx.db.get(b.missionId);
    const teenProfile = await getProfile(ctx, b.teenId);
    const payment = b.paymentId ? await ctx.db.get(b.paymentId) : null;
    return {
      _id: b._id,
      adultId: b.adultId,
      teenId: b.teenId,
      missionId: b.missionId,
      priceEuros: b.priceEuros,
      paymentStatus: payment?.status ?? null,
      missionTitle: mission?.title ?? "Mission",
      teenName: teenProfile?.firstName ?? "l'utilisateur",
    };
  },
});

/** Check-in: starts the mission (PIN verification when required). */
export const checkIn = mutation({
  args: { bookingId: v.id("bookings"), pin: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(b.missionId);
    if (!mission) throw new Error("NOT_FOUND");

    const isTeen = b.teenId === user._id;
    const isAdult = b.adultId === user._id;
    if (!isTeen && !isAdult) throw new Error("FORBIDDEN");
    if (b.status !== "confirmed") {
      throw new Error(
        b.status === "pending"
          ? "La mission doit d'abord être payée pour démarrer."
          : "Cette mission ne peut pas démarrer maintenant.",
      );
    }
    if (b.checkInAt) throw new Error("La mission a déjà commencé.");

    // PIN check — only for missions that require it.
    if (mission.requiresPin) {
      if (!args.pin) throw new Error("Code requis : demande le code à 4 chiffres à l'adulte.");
      if (b.pinExpiresAt && Date.now() > b.pinExpiresAt) {
        throw new Error("Code expiré. Demande un nouveau code à l'adulte.");
      }
      if (args.pin !== b.pinCode) throw new Error("Code incorrect.");
    }

    const now = Date.now();
    await ctx.db.patch(b._id, { status: "in_progress", checkInAt: now, updatedAt: now });
    await ctx.db.patch(mission._id, { status: "in_progress" });

    await ctx.db.insert("safetyEvents", {
      userId: user._id,
      bookingId: b._id,
      type: "check_in",
      details: "Check-in de la mission",
      createdAt: now,
    });

    const conversationId = await getOrCreateConversation(ctx, b.adultId, b.teenId, b.missionId, b._id);
    await insertSystemMessage(ctx, conversationId, "La mission a commencé. Bon courage !");
    for (const uid of [b.adultId, b.teenId]) {
      await createNotification(ctx, {
        userId: uid,
        type: "mission",
        title: "Mission en cours",
        body: `« ${mission.title} » a commencé.`,
        link: `/reservations/${b._id}`,
      });
    }
    void statusFlowMessage;
  },
});

/** Check-out: the teen finishes; the adult then confirms completion. */
export const checkOut = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(b.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (b.teenId !== user._id) throw new Error("FORBIDDEN: seul l'adolescent termine la mission.");
    if (b.status !== "in_progress") throw new Error("La mission n'a pas commencé.");

    const now = Date.now();
    await ctx.db.patch(b._id, { checkOutAt: now, teenConfirmed: true, updatedAt: now });
    await ctx.db.insert("safetyEvents", {
      userId: user._id,
      bookingId: b._id,
      type: "check_out",
      details: "Check-out de la mission",
      createdAt: now,
    });
    const conversationId = await getOrCreateConversation(ctx, b.adultId, b.teenId, b.missionId, b._id);
    await insertSystemMessage(ctx, conversationId, "L'adolescent a terminé la mission.");
    await createNotification(ctx, {
      userId: b.adultId,
      type: "mission",
      title: "Mission terminée",
      body: `« ${mission.title} » — confirme la mission pour libérer le paiement.`,
      link: `/reservations/${b._id}`,
    });
  },
});

/** Adult confirms completion → booking completed, payment releasable. */
export const confirmCompletion = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(b.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (b.adultId !== user._id) throw new Error("FORBIDDEN");
    if (b.status !== "in_progress") throw new Error("La mission doit être en cours.");

    const now = Date.now();
    await ctx.db.patch(b._id, { status: "completed", updatedAt: now });
    await ctx.db.patch(mission._id, { status: "completed" });

    const conversationId = await getOrCreateConversation(ctx, b.adultId, b.teenId, b.missionId, b._id);
    await insertSystemMessage(ctx, conversationId, "Mission terminée. Merci à tous les deux !");
    await createNotification(ctx, {
      userId: b.teenId,
      type: "mission",
      title: "Mission terminée",
      body: `« ${mission.title} » — l'adulte va confirmer pour débloquer ton paiement.`,
      link: `/reservations/${b._id}`,
    });
  },
});

/** Cancel a booking (before it starts) and refund the held payment. */
export const cancel = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(b.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (b.adultId !== user._id && b.teenId !== user._id) throw new Error("FORBIDDEN");
    if (b.status === "in_progress" || b.status === "completed") {
      throw new Error("Une mission en cours ou terminée ne peut pas être annulée ici.");
    }
    if (b.status === "cancelled") return;

    const now = Date.now();
    await ctx.db.patch(b._id, { status: "cancelled", updatedAt: now });
    if (mission.status === "assigned" || mission.status === "in_progress") {
      await ctx.db.patch(mission._id, { status: "cancelled" });
    }
    if (b.paymentId) {
      const payment = await ctx.db.get(b.paymentId);
      if (payment && payment.status === "held") {
        // The real Stripe refund is scheduled from the payments module
        // (executeRefund) — the ledger is finalized there.
        await ctx.runMutation(api.payments.refundPayment, { bookingId: b._id });
      }
    }
    void internal;
    const conversationId = await getOrCreateConversation(ctx, b.adultId, b.teenId, b.missionId, b._id);
    await insertSystemMessage(ctx, conversationId, "La réservation a été annulée.");
    for (const uid of [b.adultId, b.teenId]) {
      if (uid !== user._id) {
        await createNotification(ctx, {
          userId: uid,
          type: "mission",
          title: "Réservation annulée",
          body: `« ${mission.title} » a été annulée.`,
          link: "/reservations",
        });
      }
    }
  },
});

/** Open a dispute on a booking. */
export const openDispute = mutation({
  args: { bookingId: v.id("bookings"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("NOT_FOUND");
    if (b.adultId !== user._id && b.teenId !== user._id) throw new Error("FORBIDDEN");
    if (b.status === "disputed") return;
    await ctx.db.patch(b._id, { status: "disputed", updatedAt: Date.now() });
    await ctx.db.insert("reports", {
      reporterId: user._id,
      targetType: "booking",
      targetId: args.bookingId,
      reason: "Litige mission",
      description: args.reason,
      status: "new",
      priority: "high",
      createdAt: Date.now(),
    });
    const conversationId = await getOrCreateConversation(ctx, b.adultId, b.teenId, b.missionId, b._id);
    await insertSystemMessage(
      ctx,
      conversationId,
      "Un litige a été ouvert. Notre équipe de modération va examiner la situation.",
    );
  },
});
