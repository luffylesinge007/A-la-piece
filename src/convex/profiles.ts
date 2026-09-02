import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  getProfile,
  getSettings,
  hasApprovedParent,
  requireUser,
} from "./lib/helpers";
import { computeAge } from "./lib/safety";

/** Full profile for the current user (profile + settings + derived data). */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const profile = await getProfile(ctx, user._id);
    const settings = await getSettings(ctx, user._id);
    const age = user.accountType === "teen" ? computeAge(profile?.birthDate) : null;
    const hasParent = user.accountType === "teen" ? await hasApprovedParent(ctx, user._id) : null;
    return {
      user,
      profile,
      settings,
      age,
      hasApprovedParent: hasParent,
      isMinor: user.accountType === "teen" && (age === null || age < 18),
    };
  },
});

/** Public profile view — strips every sensitive field. */
export const publicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await getProfile(ctx, args.userId);
    if (!profile) return null;
    return {
      userId: profile.userId,
      accountType: profile.accountType,
      firstName: profile.firstName,
      city: profile.city,
      bio: profile.bio,
      avatarEmoji: profile.avatarEmoji,
      skills: profile.skills ?? [],
      availability: profile.availability ?? [],
      verifiedEmail: profile.verifiedEmail ?? false,
      verifiedPhone: profile.verifiedPhone ?? false,
      verifiedIdentity: profile.verifiedIdentity ?? false,
      verifiedParent: profile.verifiedParent ?? false,
      verifiedPayment: profile.verifiedPayment ?? false,
      status: profile.status ?? "active",
    };
  },
});

/** Onboarding: create profile + default protected settings in one mutation. */
export const completeOnboarding = mutation({
  args: {
    accountType: v.union(
      v.literal("teen"),
      v.literal("adult"),
      v.literal("parent"),
      v.literal("organization"),
    ),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    city: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    avatarEmoji: v.optional(v.string()),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    availability: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.onboarded) {
      const existing = await getProfile(ctx, user._id);
      if (existing) return existing._id;
    }

    // Safety: a teen under 15 may not use the platform at all.
    if (args.accountType === "teen" && args.birthDate) {
      const age = computeAge(args.birthDate);
      if (age !== null && age < 15) {
        throw new Error(
          "FORBIDDEN: À LA PIÈCE est réservé aux adolescents de 15 ans et plus.",
        );
      }
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      userId: user._id,
      accountType: args.accountType,
      firstName: args.firstName.trim(),
      lastName: args.lastName?.trim(),
      city: args.city?.trim(),
      bio: args.bio?.trim(),
      avatarEmoji: args.avatarEmoji ?? (args.accountType === "teen" ? "🧑‍🎓" : "👤"),
      birthDate: args.accountType === "teen" ? args.birthDate : undefined,
      interests: args.interests,
      skills: args.skills,
      availability: args.availability,
      // Email is verified by the OTP sign-in flow itself.
      verifiedEmail: user.emailVerificationTime !== undefined,
      status: "active",
    });

    // Minors get hardened privacy defaults — never opt-in.
    const isMinor = args.accountType === "teen";
    await ctx.db.insert("settings", {
      userId: user._id,
      profileVisibility: isMinor ? "private" : "public",
      showOnLeaderboard: !isMinor,
      showFriends: false,
      shareLocation: isMinor ? "hidden" : "zone",
      allowMessages: !isMinor,
      notificationsEnabled: true,
      reduceAnimations: false,
      language: "fr",
      theme: "system",
    });

    await ctx.db.patch(user._id, { onboarded: true });

    await ctx.db.insert("notifications", {
      userId: user._id,
      type: "system",
      title: "Bienvenue sur À LA PIÈCE 👋",
      body:
        args.accountType === "teen"
          ? "Complète tes disponibilités et découvre tes premières missions."
          : "Publie ta première mission — c'est gratuit, tu ne paies qu'à la réservation.",
      link: args.accountType === "teen" ? "/missions" : "/missions/create",
      read: false,
      createdAt: now,
    });

    return profileId;
  },
});

/** Update editable profile fields. */
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    city: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarEmoji: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    availability: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await getProfile(ctx, user._id);
    if (!profile) throw new Error("NO_PROFILE");
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(profile._id, patch);
  },
});

/** Update user settings; minors cannot unlock hardened protections. */
export const updateSettings = mutation({
  args: {
    profileVisibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    showOnLeaderboard: v.optional(v.boolean()),
    showFriends: v.optional(v.boolean()),
    shareLocation: v.optional(
      v.union(
        v.literal("hidden"),
        v.literal("city"),
        v.literal("zone"),
        v.literal("friends"),
      ),
    ),
    allowMessages: v.optional(v.boolean()),
    notificationsEnabled: v.optional(v.boolean()),
    reduceAnimations: v.optional(v.boolean()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await getProfile(ctx, user._id);
    const settings = await getSettings(ctx, user._id);
    if (!settings) throw new Error("NO_SETTINGS");
    const isMinor = user.accountType === "teen";

    const patch: Record<string, unknown> = {};
    // Hardened protections for minors cannot be disabled.
    if (isMinor) {
      if (args.profileVisibility && args.profileVisibility !== "private") {
        throw new Error("FORBIDDEN: les mineurs gardent un profil privé.");
      }
      if (args.shareLocation && args.shareLocation !== "hidden") {
        throw new Error("FORBIDDEN: le partage de position reste désactivé pour les mineurs.");
      }
      if (args.allowMessages === true) {
        throw new Error("FORBIDDEN: les mineurs ne peuvent pas autoriser les messages inconnus.");
      }
    }
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(settings._id, patch);
    void profile;
  },
});

/** Parent links their teen account by email; teen (or parent) then approves. */
export const linkParent = mutation({
  args: { parentEmail: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "teen" && user.accountType !== "parent") {
      throw new Error("FORBIDDEN: la liaison parentale concerne les ados et les parents.");
    }
    const email = args.parentEmail.trim().toLowerCase();
    const parentUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!parentUser || parentUser.accountType !== "parent") {
      throw new Error(
        "Aucun compte parent trouvé avec cet email. Le responsable doit d'abord créer un compte « Parent ».",
      );
    }
    const parentProfile = await getProfile(ctx, parentUser._id);
    const teenId = user.accountType === "teen" ? user._id : parentProfile?.linkedTeenIds?.[0];
    if (!teenId) throw new Error("NO_TEEN");
    if (user.accountType === "parent") {
      throw new Error("Le parent doit attendre une invitation de l'adolescent depuis son compte.");
    }
    const existing = await ctx.db
      .query("parentLinks")
      .withIndex("by_teen", (q) => q.eq("teenUserId", teenId))
      .first();
    if (existing) {
      if (existing.status === "approved") throw new Error("Un responsable est déjà validé.");
      await ctx.db.patch(existing._id, { parentUserId: parentUser._id, status: "pending" });
      return existing._id;
    }
    const id = await ctx.db.insert("parentLinks", {
      teenUserId: teenId,
      parentUserId: parentUser._id,
      status: "pending",
      createdAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: parentUser._id,
      type: "parent",
      title: "Demande de liaison parentale",
      body: `${profile?.firstName ?? "Un adolescent"} t'a désigné comme responsable légal.`,
      link: "/famille",
      read: false,
      createdAt: Date.now(),
    });
    return id;
  },
});

/** Parent approves (or declines) a pending link. */
export const respondParentLink = mutation({
  args: {
    linkId: v.id("parentLinks"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") throw new Error("FORBIDDEN");
    const link = await ctx.db.get(args.linkId);
    if (!link || link.parentUserId !== user._id) throw new Error("NOT_FOUND");
    await ctx.db.patch(link._id, {
      status: args.accept ? "approved" : "declined",
    });
    if (args.accept) {
      const parentProfile = await getProfile(ctx, user._id);
      const teens = parentProfile?.linkedTeenIds ?? [];
      if (!teens.includes(link.teenUserId)) {
        await ctx.db.patch(parentProfile!._id, {
          linkedTeenIds: [...teens, link.teenUserId],
        });
      }
      await ctx.db.insert("notifications", {
        userId: link.teenUserId,
        type: "parent",
        title: "Responsable validé ✅",
        body: "Ton responsable légal peut maintenant autoriser certaines missions.",
        link: "/securite",
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

/** Parental approval for a specific 🟡 mission. */
export const approveMissionAsParent = mutation({
  args: { missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") throw new Error("FORBIDDEN");
    const parentProfile = await getProfile(ctx, user._id);
    const teenIds = parentProfile?.linkedTeenIds ?? [];
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("NOT_FOUND");
    for (const teenId of teenIds) {
      await ctx.db.insert("notifications", {
        userId: teenId,
        type: "parent",
        title: "Mission autorisée ✅",
        body: `Ton responsable a autorisé « ${mission.title} ».`,
        link: `/missions/${args.missionId}`,
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

/** Demo/test helper: mark the current account's email as verified (dev mode). */
export const markDemoVerified = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = await getProfile(ctx, user._id);
    if (profile) {
      await ctx.db.patch(profile._id, { verifiedEmail: true, verifiedPhone: true });
    }
  },
});
