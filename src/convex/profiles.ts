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
import {
  consumeRateLimit,
  countActiveSessions,
  logSecurityEvent,
  revokeAllSessions,
  sanitizeText,
  SECURITY_EVENTS,
} from "./lib/security";

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
      avatarIcon: profile.avatarIcon,
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
    avatarIcon: v.optional(v.string()),
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
      firstName: sanitizeText(args.firstName, 40),
      lastName: args.lastName ? sanitizeText(args.lastName, 40) : undefined,
      city: args.city ? sanitizeText(args.city, 60) : undefined,
      bio: args.bio ? sanitizeText(args.bio, 500) : undefined,
      avatarIcon: args.avatarIcon ?? (args.accountType === "teen" ? "graduation-cap" : "user"),
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
      title: "Bienvenue sur À LA PIÈCE",
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

/** Update editable profile fields (strictly sanitized). */
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    city: v.optional(v.string()),
    bio: v.optional(v.string()),
    avatarIcon: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    availability: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const profile = await getProfile(ctx, user._id);
    if (!profile) throw new Error("NO_PROFILE");
    const patch: Record<string, unknown> = {};
    if (args.firstName !== undefined) patch.firstName = sanitizeText(args.firstName, 40);
    if (args.lastName !== undefined) patch.lastName = sanitizeText(args.lastName, 40);
    if (args.city !== undefined) patch.city = sanitizeText(args.city, 60);
    if (args.bio !== undefined) patch.bio = sanitizeText(args.bio, 500);
    if (args.avatarIcon !== undefined) patch.avatarIcon = sanitizeText(args.avatarIcon, 40);
    if (args.interests !== undefined) {
      patch.interests = args.interests.slice(0, 12).map((s) => sanitizeText(s, 30));
    }
    if (args.skills !== undefined) {
      patch.skills = args.skills.slice(0, 12).map((s) => sanitizeText(s, 30));
    }
    if (args.availability !== undefined) {
      patch.availability = args.availability.slice(0, 14).map((s) => sanitizeText(s, 20));
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
    const myProfile = await getProfile(ctx, user._id);
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
      body: `${myProfile?.firstName ?? "Un adolescent"} t'a désigné comme responsable légal.`,
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
        title: "Responsable validé",
        body: "Ton responsable légal peut maintenant autoriser certaines missions.",
        link: "/securite",
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

/** Parental approval for a restricted (parental-approval) mission. */
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
        title: "Mission autorisée",
        body: `Ton responsable a autorisé « ${mission.title} ».`,
        link: `/missions/${args.missionId}`,
        read: false,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Parent/responsible adult registers (or updates) the Stripe connected account
 * that receives the teen's payout transfers. Only an ID is stored — never any
 * secret or bank detail.
 */
export const setGuardianPayoutAccount = mutation({
  args: { payoutStripeAccountId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "parent") {
      throw new Error("FORBIDDEN: seul un compte parent/responsable peut définir un compte de virement.");
    }
    const accountId = args.payoutStripeAccountId.trim();
    if (!/^acct_[A-Za-z0-9]{8,}$/.test(accountId)) {
      throw new Error("Identifiant de compte Stripe invalide (format attendu : acct_…).");
    }
    const profile = await getProfile(ctx, user._id);
    if (!profile) throw new Error("NO_PROFILE: complète d'abord ton profil.");
    await ctx.db.patch(profile._id, {
      payoutStripeAccountId: accountId,
      verifiedPayment: true,
    });
    return { ok: true };
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

// ---------------------------------------------------------------------------
// Account security & RGPD
// ---------------------------------------------------------------------------

/** How many active sessions does the current account have? */
export const sessionCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { sessions: await countActiveSessions(ctx, user._id) };
  },
});

/** "Sign out everywhere": revokes every active session server-side. */
export const revokeAllMySessions = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const count = await revokeAllSessions(ctx, user._id);
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.LOGOUT_ALL,
      severity: "info",
      userId: user._id,
      details: `${count} session(s) révoquée(s) par l'utilisateur.`,
    });
    return { revoked: count };
  },
});

/**
 * RGPD — export all data owned by the current user, in one structured object.
 * Only the owner's own data is ever returned (IDOR-safe by construction).
 */
export const exportMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rl = await consumeRateLimit(ctx, "gdpr", user._id);
    if (!rl.ok) {
      throw new Error("Limite d'export atteinte — réessaie demain.");
    }
    void rl;
    const uid = user._id;
    const [profile, settings, wallets, goals, transactions, withdrawals, apps, bookings, reviews, notifs, safetyEvs] =
      await Promise.all([
        getProfile(ctx, uid),
        getSettings(ctx, uid),
        ctx.db.query("wallets").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
        ctx.db.query("savingsGoals").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
        ctx.db.query("transactions").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
        ctx.db.query("withdrawals").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
        ctx.db.query("applications").withIndex("by_teen", (q) => q.eq("teenId", uid)).collect(),
        ctx.db.query("bookings").withIndex("by_teen", (q) => q.eq("teenId", uid)).collect(),
        ctx.db.query("reviews").withIndex("by_target", (q) => q.eq("targetUserId", uid)).collect(),
        ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
        ctx.db.query("safetyEvents").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
      ]);
    // Bookings as adult too.
    const adultBookings = await ctx.db
      .query("bookings")
      .withIndex("by_adult", (q) => q.eq("adultId", uid))
      .collect();

    return {
      exportedAt: Date.now(),
      account: { name: user.name, email: user.email, accountType: user.accountType },
      profile,
      settings,
      wallets,
      savingsGoals: goals,
      transactions,
      withdrawals,
      applications: apps,
      bookings: [...bookings, ...adultBookings],
      reviewsReceived: reviews,
      notifications: notifs,
      safetyEvents: safetyEvs,
    };
  },
});

/**
 * RGPD — request account deletion. The account is anonymized immediately:
 * profile PII is wiped, sessions revoked, and a security event recorded for
 * the retention policy. A human/purge job can then hard-delete if configured.
 */
export const deleteMyAccount = mutation({
  args: { confirm: v.literal("SUPPRIMER") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.confirm !== "SUPPRIMER") throw new Error("Confirmation requise.");
    const rl = await consumeRateLimit(ctx, "gdpr", user._id);
    if (!rl.ok) throw new Error("Limite atteinte — réessaie plus tard.");

    const now = Date.now();
    // Wipe personal data from the profile (keep the row for referential
    // integrity of bookings/payments — anonymized).
    const profile = await getProfile(ctx, user._id);
    if (profile) {
      await ctx.db.patch(profile._id, {
        firstName: "Utilisateur",
        lastName: undefined,
        city: undefined,
        bio: undefined,
        avatarIcon: "user",
        birthDate: undefined,
        interests: undefined,
        skills: undefined,
        availability: undefined,
        payoutStripeAccountId: undefined,
        linkedTeenIds: undefined,
        status: "blocked",
        dataDeletedAt: now,
      });
    }
    await ctx.db.patch(user._id, { email: undefined, name: "Compte supprimé", image: undefined });
    // Kill every session — the account becomes unusable.
    await revokeAllSessions(ctx, user._id);
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.DATA_DELETED,
      severity: "warning",
      userId: user._id,
      details: "Compte anonymisé et sessions révoquées (demande RGPD).",
    });
    return { ok: true };
  },
});
