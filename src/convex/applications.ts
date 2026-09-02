import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createNotification,
  effectiveAge,
  getOrCreateConversation,
  getProfile,
  hasApprovedParent,
  insertSystemMessage,
  isAdultAccount,
  requireUser,
} from "./lib/helpers";
import { canTeenApply, evaluateTeenAccess } from "./lib/safety";

/** Applications received on my missions (adult side). */
export const listReceived = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!isAdultAccount(user)) return [];
    const myMissions = await ctx.db
      .query("missions")
      .withIndex("by_publisher", (q) => q.eq("publisherId", user._id))
      .collect();
    const missionIds = new Set(myMissions.map((m) => m._id));

    const result = [];
    // Small scale: iterate applications by teen index is not needed; fetch recent by mission.
    for (const missionId of missionIds) {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_mission", (q) => q.eq("missionId", missionId))
        .collect();
      for (const app of apps) {
        const mission = myMissions.find((m) => m._id === missionId)!;
        const teenProfile = await getProfile(ctx, app.teenId);
        result.push({
          _id: app._id,
          status: app.status,
          message: app.message,
          createdAt: app.createdAt,
          mission: {
            _id: mission._id,
            title: mission.title,
            priceEuros: mission.priceEuros,
            scheduledDate: mission.scheduledDate,
            scheduledTime: mission.scheduledTime,
            status: mission.status,
          },
          teen: teenProfile
            ? {
                userId: teenProfile.userId,
                firstName: teenProfile.firstName,
                avatarEmoji: teenProfile.avatarEmoji,
                city: teenProfile.city,
                bio: teenProfile.bio,
                skills: teenProfile.skills ?? [],
                availability: teenProfile.availability ?? [],
                verifiedEmail: teenProfile.verifiedEmail ?? false,
                verifiedPhone: teenProfile.verifiedPhone ?? false,
              }
            : null,
        });
      }
    }
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result;
  },
});

/** Apply to a mission (teens only) — safety gate re-checked server-side. */
export const apply = mutation({
  args: {
    missionId: v.id("missions"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") {
      throw new Error("FORBIDDEN: seuls les adolescents peuvent candidater.");
    }
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("NOT_FOUND: mission introuvable.");
    if (mission.status !== "published") {
      throw new Error("Cette mission n'accepte plus de candidatures.");
    }
    if (mission.publisherId === user._id) {
      throw new Error("Tu ne peux pas candidater à ta propre mission.");
    }

    // === SAFETY ENGINE — server-side, cannot be bypassed by the client ===
    const age = await effectiveAge(ctx, user);
    const hasParent = await hasApprovedParent(ctx, user._id);
    const access = evaluateTeenAccess(mission, age);
    if (!canTeenApply(access, hasParent)) {
      if (access.level === "adults_only") {
        throw new Error("FORBIDDEN: cette mission est réservée aux majeurs.");
      }
      if (access.level === "forbidden") {
        throw new Error("FORBIDDEN: cette mission est interdite aux mineurs.");
      }
      throw new Error(
        "FORBIDDEN: autorisation parentale requise pour cette mission. Demande à ton responsable de la valider.",
      );
    }

    // Duplicate check.
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .collect();
    if (existing.some((a) => a.missionId === args.missionId && a.status !== "withdrawn" && a.status !== "declined")) {
      throw new Error("Tu as déjà candidaté à cette mission.");
    }

    const now = Date.now();
    const applicationId = await ctx.db.insert("applications", {
      missionId: args.missionId,
      teenId: user._id,
      message: args.message?.trim(),
      status: "pending",
      createdAt: now,
    });
    await ctx.db.patch(mission._id, {
      applicantCount: (mission.applicantCount ?? 0) + 1,
    });

    await createNotification(ctx, {
      userId: mission.publisherId,
      type: "application",
      title: "Nouvelle candidature 🎉",
      body: `${(await getProfile(ctx, user._id))?.firstName ?? "Un ado"} veut réaliser « ${mission.title} ».`,
      link: "/candidatures",
    });

    return applicationId;
  },
});

/** Withdraw an application. */
export const withdraw = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const app = await ctx.db.get(args.applicationId);
    if (!app || app.teenId !== user._id) throw new Error("NOT_FOUND");
    if (app.status !== "pending") throw new Error("Cette candidature a déjà été traitée.");
    await ctx.db.patch(app._id, { status: "withdrawn" });
    const mission = await ctx.db.get(app.missionId);
    if (mission) {
      await ctx.db.patch(mission._id, {
        applicantCount: Math.max(0, (mission.applicantCount ?? 1) - 1),
      });
    }
  },
});

/** Accept an application → creates the booking and opens the chat. */
export const accept = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(app.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (mission.publisherId !== user._id) throw new Error("FORBIDDEN");
    if (app.status !== "pending") throw new Error("Cette candidature a déjà été traitée.");
    if (mission.status !== "published") {
      throw new Error("Cette mission n'est plus disponible.");
    }

    const now = Date.now();
    const bookingId = await ctx.db.insert("bookings", {
      missionId: mission._id,
      adultId: user._id,
      teenId: app.teenId,
      status: "pending", // confirmed after payment
      priceEuros: mission.priceEuros,
      createdAt: now,
      teenConfirmed: false,
    });

    await ctx.db.patch(app._id, { status: "accepted" });
    // Decline other pending applications for the same mission.
    const others = await ctx.db
      .query("applications")
      .withIndex("by_mission", (q) => q.eq("missionId", mission._id))
      .collect();
    for (const other of others) {
      if (other._id !== app._id && other.status === "pending") {
        await ctx.db.patch(other._id, { status: "declined" });
        await createNotification(ctx, {
          userId: other.teenId,
          type: "application",
          title: "Candidature non retenue",
          body: `« ${mission.title} » a été confiée à un autre utilisateur.`,
          link: "/missions",
        });
      }
    }
    await ctx.db.patch(mission._id, { status: "assigned" });

    // Open the mission chat with a system message.
    const conversationId = await getOrCreateConversation(ctx, user._id, app.teenId, mission._id, bookingId);
    await insertSystemMessage(ctx, conversationId, "Candidature acceptée — la mission est réservée en attente de paiement.");
    await ctx.db.patch(conversationId, { bookingId });

    await createNotification(ctx, {
      userId: app.teenId,
      type: "application",
      title: "🎉 Candidature acceptée !",
      body: `« ${mission.title} » — ${user.name ?? "L'adulte"} t'a sélectionné. Chat ouvert.`,
      link: `/reservations/${bookingId}`,
    });

    return bookingId;
  },
});

/** Decline an application. */
export const decline = mutation({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("NOT_FOUND");
    const mission = await ctx.db.get(app.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    if (mission.publisherId !== user._id) throw new Error("FORBIDDEN");
    if (app.status !== "pending") throw new Error("Cette candidature a déjà été traitée.");
    await ctx.db.patch(app._id, { status: "declined" });
    await createNotification(ctx, {
      userId: app.teenId,
      type: "application",
      title: "Candidature non retenue",
      body: `« ${mission.title} » — cette fois-ci ça n'a pas été retenu. D'autres missions t'attendent !`,
      link: "/missions",
    });
  },
});

/** Compatibility score — a recommendation aid, never a guarantee (shown with reasons). */
export const compatibility = query({
  args: { missionId: v.id("missions"), teenId: v.id("users") },
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId);
    const profile = await getProfile(ctx, args.teenId);
    if (!mission || !profile) return null;
    const access = evaluateTeenAccess(mission, null);
    let score = 55;
    const reasons: string[] = [];
    const skills = profile.skills ?? [];
    if (skills.length > 0 && skills.some((s) => s.toLowerCase().includes(mission.categorySlug.split("_")[0]))) {
      score += 22;
      reasons.push("Compétences correspondant à la mission");
    }
    if ((profile.city ?? "") === mission.city) {
      score += 18;
      reasons.push("Dans la même ville que la mission");
    }
    if ((profile.availability ?? []).length > 0) {
      score += 10;
      reasons.push("Disponibilités renseignées");
    }
    if (profile.verifiedEmail) {
      score += 5;
      reasons.push("Email vérifié");
    }
    if (access.level === "allowed") {
      score += 5;
      reasons.push("Aucune restriction particulière");
    }
    return { score: Math.min(97, score), reasons };
  },
});
