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
import { canTeenApply, computeFee, evaluateTeenAccess } from "./lib/safety";
import { teenGamification } from "./gamification";

/** Public shape of a candidate for adult decision cards (reputation + gamification, no sensitive data). */
async function candidateCard(ctx: any, mission: any, app: any) {
  const profile = await getProfile(ctx, app.teenId);
  const game = profile ? await teenGamification(ctx, profile.userId) : null;
  return {
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
      missionType: mission.missionType ?? "verified",
    },
    teen: profile
      ? {
          userId: profile.userId,
          firstName: profile.firstName,
          avatarEmoji: profile.avatarEmoji,
          city: profile.city,
          bio: profile.bio,
          skills: profile.skills ?? [],
          availability: profile.availability ?? [],
          verifiedEmail: profile.verifiedEmail ?? false,
          verifiedPhone: profile.verifiedPhone ?? false,
          // gamification for the comparison grid
          level: game?.level.number ?? 1,
          levelTitle: game?.level.title ?? "Débutant",
          xp: game?.xp ?? 0,
          missionsDone: game?.stats.completed ?? 0,
          badges: game?.badges.length ?? 0,
          averageRating: game?.stats.averageRating ?? null,
          reviewCount: game?.stats.reviewCount ?? 0,
        }
      : null,
  };
}

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
    for (const missionId of missionIds) {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_mission", (q) => q.eq("missionId", missionId))
        .collect();
      const mission = myMissions.find((m) => m._id === missionId)!;
      for (const app of apps) {
        result.push(await candidateCard(ctx, mission, app));
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

    // === SAFETY ENGINE — server-side, cannot be bypassed ===
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

    // 🛡️ Verified missions accept only the first `maxApplicants` (default 5).
    const maxApplicants = mission.maxApplicants ?? 5;
    if ((mission.missionType ?? "verified") === "verified") {
      const activeApps = await ctx.db
        .query("applications")
        .withIndex("by_mission", (q) => q.eq("missionId", mission._id))
        .collect();
      const taken = activeApps.filter(
        (a) => a.status === "pending" || a.status === "accepted",
      ).length;
      if (taken >= maxApplicants) {
        throw new Error("COMPLET: les candidatures sont complètes pour cette mission.");
      }
    } else {
      // ⚡ Quick missions are claimed, not applied to.
      throw new Error("Cette mission est une Mission rapide : utilise « Je prends la mission ».");
    }

    // Duplicate check.
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .collect();
    if (
      existing.some(
        (a) => a.missionId === args.missionId && a.status !== "withdrawn" && a.status !== "declined",
      )
    ) {
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

    const myProfile = await getProfile(ctx, user._id);
    const afterCount = (mission.applicantCount ?? 0) + 1;
    const isFull = afterCount >= maxApplicants;
    await createNotification(ctx, {
      userId: mission.publisherId,
      type: "application",
      title: isFull ? `👥 ${afterCount} candidats — complet !` : "👤 Nouveau candidat",
      body: isFull
        ? `« ${mission.title} » a reçu ${maxApplicants} candidatures : compare les profils et choisis ta personne.`
        : `${myProfile?.firstName ?? "Un ado"} veut réaliser « ${mission.title} ».`,
      link: isFull ? "/candidatures" : "/candidatures",
    });

    return applicationId;
  },
});

/** ⚡ Claim a quick mission: first teen to click wins it — auto-accept + booking. */
export const claimQuick = mutation({
  args: { missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen") {
      throw new Error("FORBIDDEN: seuls les adolescents peuvent prendre une mission.");
    }
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("NOT_FOUND: mission introuvable.");
    if ((mission.missionType ?? "verified") !== "quick") {
      throw new Error("Cette mission est une Mission vérifiée : candidate normalement.");
    }
    if (mission.status !== "published") {
      throw new Error("Dommage ! Cette mission vient d'être prise par un autre adolescent.");
    }

    // === SAFETY ENGINE — same hard gate as applications ===
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

    // First-click-wins guard: re-read and assign atomically-ish.
    const fresh = await ctx.db.get(args.missionId);
    if (!fresh || fresh.status !== "published") {
      throw new Error("Dommage ! Cette mission vient d'être prise par un autre adolescent.");
    }

    const now = Date.now();
    const bookingId = await ctx.db.insert("bookings", {
      missionId: mission._id,
      adultId: mission.publisherId,
      teenId: user._id,
      status: "pending", // confirmed after payment
      priceEuros: mission.priceEuros,
      platformFeeEuros: computeFee(mission.priceEuros),
      createdAt: now,
      teenConfirmed: false,
    });

    // Mark the mission as claimed → disappears from everyone else.
    await ctx.db.patch(mission._id, {
      status: "assigned",
      claimedBy: user._id,
      claimedAt: now,
    });

    // Record an application row for history (auto-accepted).
    await ctx.db.insert("applications", {
      missionId: mission._id,
      teenId: user._id,
      status: "accepted",
      createdAt: now,
    });

    // Open the chat.
    const conversationId = await getOrCreateConversation(
      ctx,
      mission.publisherId,
      user._id,
      mission._id,
      bookingId,
    );
    await insertSystemMessage(
      ctx,
      conversationId,
      `⚡ Mission rapide prise par ${await teenFirstName(ctx, user._id)} ! Prochaine étape : le paiement sécurisé.`,
    );
    await ctx.db.patch(conversationId, { bookingId });

    const publisherProfile = await getProfile(ctx, mission.publisherId);
    await createNotification(ctx, {
      userId: mission.publisherId,
      type: "mission",
      title: "⚡ Mission prise !",
      body: `${await teenFirstName(ctx, user._id)} vient de prendre « ${mission.title} ». Finalise avec le paiement sécurisé.`,
      link: `/reservations/${bookingId}`,
    });
    await createNotification(ctx, {
      userId: user._id,
      type: "mission",
      title: "🎉 C'est pour toi !",
      body: `« ${mission.title} » t'est attribuée — ${publisherProfile?.firstName ?? "l'adulte"} doit confirmer le paiement.`,
      link: `/reservations/${bookingId}`,
    });

    return bookingId;
  },
});

async function teenFirstName(ctx: any, teenId: any) {
  const p = await getProfile(ctx, teenId);
  return p?.firstName ?? "Un adolescent";
}

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

/** Accept an application → creates the booking and opens the chat (verified missions). */
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
      platformFeeEuros: computeFee(mission.priceEuros),
      createdAt: now,
      teenConfirmed: false,
    });

    await ctx.db.patch(app._id, { status: "accepted" });
    // Politely notify the other candidates — never negatively framed.
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
          title: "Mission attribuée à un autre candidat",
          body: `« ${mission.title} » a été confiée à un autre profil — de nouvelles missions compatibles t'attendent !`,
          link: "/missions",
        });
      }
    }
    await ctx.db.patch(mission._id, { status: "assigned" });

    // Open the mission chat with a system message.
    const conversationId = await getOrCreateConversation(ctx, user._id, app.teenId, mission._id, bookingId);
    await insertSystemMessage(
      ctx,
      conversationId,
      "Sélection confirmée 🎉 — la mission est réservée en attente de paiement.",
    );
    await ctx.db.patch(conversationId, { bookingId });

    await createNotification(ctx, {
      userId: app.teenId,
      type: "application",
      title: "🎉 Félicitations, tu es sélectionné·e !",
      body: `« ${mission.title} » — ${user.name ?? "l'adulte"} t'a choisi·e. Chat ouvert.`,
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
    if (
      skills.length > 0 &&
      skills.some((s) => s.toLowerCase().includes(mission.categorySlug.split("_")[0]))
    ) {
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
