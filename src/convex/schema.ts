import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ---------------------------------------------------------------------------
// Roles & account types
// ---------------------------------------------------------------------------
export const ACCOUNT_TYPES = ["teen", "adult", "parent", "organization", "admin", "moderator"] as const;
export const accountTypeValidator = v.union(...ACCOUNT_TYPES.map((t) => v.literal(t)));
export type AccountType = Infer<typeof accountTypeValidator>;

// default auth role kept for the template auth system
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;
export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------
export const MISSION_STATUS = ["published", "assigned", "in_progress", "completed", "cancelled"] as const;
export const APPLICATION_STATUS = ["pending", "accepted", "declined", "withdrawn"] as const;
export const BOOKING_STATUS = ["pending", "confirmed", "in_progress", "completed", "cancelled", "disputed"] as const;
export const PAYMENT_STATUS = ["requires_payment", "processing", "held", "released", "refunded", "failed"] as const;
export const TRANSACTION_TYPE = ["mission_payment", "platform_fee", "tip", "withdrawal", "refund", "payout_transfer"] as const;
/** Teen payout requests — money actually moves via Stripe when configured. */
export const WITHDRAWAL_STATUS = ["requested", "approved", "on_hold", "paid", "rejected", "failed"] as const;
const withdrawalStatusValidator = v.union(...WITHDRAWAL_STATUS.map((s) => v.literal(s)));
export const RISK_LEVEL = ["low", "medium", "high"] as const;
export const ACCESS_LEVEL = ["allowed", "parental_approval", "adults_only", "forbidden"] as const;
export const REPORT_STATUS = ["new", "in_progress", "resolved", "rejected"] as const;
export const NOTIFICATION_TYPE = [
  "mission", "message", "application", "payment", "quest", "xp", "badge", "challenge", "safety", "parent", "system",
] as const;
// Mission types: quick (first teen to claim wins) / verified (adult picks among capped applications)
export const MISSION_TYPES = ["quick", "verified"] as const;
export const missionTypeValidator = v.union(...MISSION_TYPES.map((t) => v.literal(t)));

const missionStatusValidator = v.union(...MISSION_STATUS.map((s) => v.literal(s)));
const applicationStatusValidator = v.union(...APPLICATION_STATUS.map((s) => v.literal(s)));
const bookingStatusValidator = v.union(...BOOKING_STATUS.map((s) => v.literal(s)));
const paymentStatusValidator = v.union(...PAYMENT_STATUS.map((s) => v.literal(s)));
const transactionTypeValidator = v.union(...TRANSACTION_TYPE.map((t) => v.literal(t)));
const riskLevelValidator = v.union(...RISK_LEVEL.map((r) => v.literal(r)));
const reportStatusValidator = v.union(...REPORT_STATUS.map((s) => v.literal(s)));
const notificationTypeValidator = v.union(...NOTIFICATION_TYPE.map((t) => v.literal(t)));

const schema = defineSchema(
  {
    // Default auth tables — do not remove or modify
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
      // À LA PIÈCE additions
      accountType: v.optional(accountTypeValidator),
      onboarded: v.optional(v.boolean()),
    }).index("email", ["email"]),

    // Extended per-role profile data
    profiles: defineTable({
      userId: v.id("users"),
      accountType: accountTypeValidator,
      firstName: v.string(),
      lastName: v.optional(v.string()),
      city: v.optional(v.string()),
      bio: v.optional(v.string()),
      /** Pictogram name (src/components/icons.tsx) — replaces the old avatarEmoji. */
      avatarIcon: v.optional(v.string()),
      /** @deprecated legacy emoji avatar (pre-pictogram rows); read by the data migration only. */
      avatarEmoji: v.optional(v.string()),
      // teen only
      birthDate: v.optional(v.string()), // ISO date — never exposed publicly
      interests: v.optional(v.array(v.string())),
      skills: v.optional(v.array(v.string())),
      availability: v.optional(v.array(v.string())), // e.g. ["samedi_am","dimanche"]
      // parent
      linkedTeenIds: v.optional(v.array(v.id("users"))),
      // verification flags (only real checks set these)
      verifiedEmail: v.optional(v.boolean()),
      verifiedPhone: v.optional(v.boolean()),
      verifiedIdentity: v.optional(v.boolean()),
      verifiedParent: v.optional(v.boolean()),
      verifiedPayment: v.optional(v.boolean()),
      /** Parent/guardian: Stripe connected account receiving the teen's payouts (acct_…). */
      payoutStripeAccountId: v.optional(v.string()),
      /**
       * Teen's OWN bank account for payouts (feature #43).
       * Only Stripe identifiers and display data are stored — never any bank
       * secret: the IBAN itself lives exclusively inside Stripe Connect.
       */
      bankAccount: v.optional(
        v.object({
          stripeAccountId: v.string(),
          holderName: v.string(),
          country: v.optional(v.string()),
          status: v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected")),
          payoutsEnabled: v.optional(v.boolean()),
          last4: v.optional(v.string()),
          bankName: v.optional(v.string()),
          createdAt: v.number(),
          verifiedAt: v.optional(v.number()),
        }),
      ),
      /** Parental consent for the bank account (provider rules for under-16s). */
      bankConsent: v.optional(
        v.object({
          status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
          parentId: v.optional(v.id("users")),
          requestedAt: v.number(),
          decidedAt: v.optional(v.number()),
        }),
      ),
      /** Anti-fraud: when the payout account last changed (drives the security delay). */
      bankAccountChangedAt: v.optional(v.number()),
      // moderation
      status: v.optional(v.union(v.literal("active"), v.literal("suspended"), v.literal("blocked"))),
      /** Security: last password/email/phone sensitive change (timestamp only). */
      lastSecurityChangeAt: v.optional(v.number()),
      /** RGPD export/deletion bookkeeping (timestamps only). */
      dataDeletedAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    settings: defineTable({
      userId: v.id("users"),
      profileVisibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
      showOnLeaderboard: v.optional(v.boolean()),
      showFriends: v.optional(v.boolean()),
      shareLocation: v.optional(v.union(v.literal("hidden"), v.literal("city"), v.literal("zone"), v.literal("friends"))),
      allowMessages: v.optional(v.boolean()),
      notificationsEnabled: v.optional(v.boolean()),
      reduceAnimations: v.optional(v.boolean()),
      language: v.optional(v.string()),
      theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    }).index("by_user", ["userId"]),

    // Legal guardian link for minors
    parentLinks: defineTable({
      teenUserId: v.id("users"),
      parentUserId: v.id("users"),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
      createdAt: v.number(),
    }).index("by_teen", ["teenUserId"]).index("by_parent", ["parentUserId"]),

    categories: defineTable({
      slug: v.string(),
      label: v.string(),
      /** Pictogram name (src/components/icons.tsx). */
      icon: v.string(),
      teenFriendly: v.boolean(),
      riskLevel: riskLevelValidator,
    }).index("by_slug", ["slug"]),

    missions: defineTable({
      publisherId: v.id("users"),
      title: v.string(),
      description: v.string(),
      categorySlug: v.string(),
      priceEuros: v.number(),
      durationMin: v.number(),
      scheduledDate: v.string(), // YYYY-MM-DD
      scheduledTime: v.string(), // HH:mm
      city: v.string(),
      area: v.string(), // approximate area label, never exact address
      status: missionStatusValidator,
      riskLevel: riskLevelValidator,
      // ⚡ quick / 🛡️ verified — two distinct flows
      missionType: v.optional(missionTypeValidator),
      // quick missions: id of the teen who claimed it
      claimedBy: v.optional(v.id("users")),
      claimedAt: v.optional(v.number()),
      // verified missions: max applications taken into account (default 5)
      maxApplicants: v.optional(v.number()),
      allowedForTeens: v.boolean(), // computed by the safety engine at publish
      accessNote: v.optional(v.string()), // why (parental approval / adults only…)
      requiredSkills: v.optional(v.array(v.string())),
      equipment: v.optional(v.string()),
      safetyNotes: v.optional(v.string()),
      teamSize: v.optional(v.number()),
      requiresPin: v.optional(v.boolean()),
      applicantCount: v.optional(v.number()), // drives popularity
      createdAt: v.number(),
      // precise address — only revealed to the assigned/confirmed user
      exactAddress: v.optional(v.string()),
      /** Anti-scam engine: mission queued for human moderation before being visible. */
      underReview: v.optional(v.boolean()),
      /** Why the mission was queued (fraud reasons, joined by " · "). */
      reviewReasons: v.optional(v.array(v.string())),
    })
      .index("by_status", ["status", "createdAt"])
      .index("by_publisher", ["publisherId", "createdAt"])
      .index("by_category", ["categorySlug"]),

    applications: defineTable({
      missionId: v.id("missions"),
      teenId: v.id("users"),
      message: v.optional(v.string()),
      status: applicationStatusValidator,
      createdAt: v.number(),
    })
      .index("by_mission", ["missionId", "createdAt"])
      .index("by_teen", ["teenId", "createdAt"]),

    bookings: defineTable({
      missionId: v.id("missions"),
      adultId: v.id("users"),
      teenId: v.id("users"),
      status: bookingStatusValidator,
      priceEuros: v.number(),
      platformFeeEuros: v.number(),
      paymentId: v.optional(v.id("payments")),
      pinCode: v.optional(v.string()),
      pinExpiresAt: v.optional(v.number()),
      checkInAt: v.optional(v.number()),
      checkOutAt: v.optional(v.number()),
      teenConfirmed: v.optional(v.boolean()), // teen accepted completion
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index("by_mission", ["missionId"])
      .index("by_teen", ["teenId", "createdAt"])
      .index("by_adult", ["adultId", "createdAt"]),

    payments: defineTable({
      bookingId: v.id("bookings"),
      payerId: v.id("users"),
      provider: v.literal("stripe"),
      providerRef: v.string(), // Stripe Checkout Session id
      /** Stripe PaymentIntent id — required for refunds and tips reconciliation. */
      providerIntentId: v.optional(v.string()),
      /** "mission" = escrow for a booking, "tip" = optional gratuity. */
      kind: v.optional(v.union(v.literal("mission"), v.literal("tip"))),
      amountCents: v.number(),
      feeCents: v.number(),
      currency: v.string(),
      status: paymentStatusValidator,
      // receiptUrl: v.optional(v.string()), // enabled with a real Stripe account
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
      releasedAt: v.optional(v.number()),
    })
      .index("by_booking", ["bookingId"])
      .index("by_provider_ref", ["providerRef"])
      .index("by_intent", ["providerIntentId"]),

    wallets: defineTable({
      userId: v.id("users"),
      availableCents: v.number(),
      pendingCents: v.number(),
      totalEarnedCents: v.number(),
    }).index("by_user", ["userId"]),

    savingsGoals: defineTable({
      userId: v.id("users"),
      label: v.string(),
      targetCents: v.number(),
      savedCents: v.number(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    transactions: defineTable({
      userId: v.id("users"),
      type: transactionTypeValidator,
      bookingId: v.optional(v.id("bookings")),
      amountCents: v.number(), // signed: + credit, - debit
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"), v.literal("refunded")),
      description: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    /**
     * Teen payout request: the teen asks to transfer their available balance to
     * the bank account of their legal guardian. With Stripe configured the
     * transfer is a real Stripe payout to the guardian's connected account;
     * without it the flow stays in "requested/approved" with clear states.
     */
    withdrawals: defineTable({
      userId: v.id("users"), // teen requester
      guardianId: v.optional(v.id("users")), // approving parent/responsible adult
      amountCents: v.number(),
      status: withdrawalStatusValidator,
      /** Where the money goes: the teen's own bank or the guardian's account. */
      destination: v.optional(v.union(v.literal("own_bank"), v.literal("guardian"))),
      /** Mission concerned (payment tracking, spec #43 §4). */
      bookingId: v.optional(v.id("bookings")),
      /** Anti-fraud: payment parked pending extra verification (spec #43 §6). */
      onHold: v.optional(v.boolean()),
      holdReason: v.optional(v.string()),
      /** Payout destination for the guardian's connected account (Stripe acct_…). */
      payoutStripeAccountId: v.optional(v.string()),
      provider: v.optional(v.literal("stripe")),
      /** Stripe payout/transfer id once the money actually moved. */
      providerRef: v.optional(v.string()),
      failureReason: v.optional(v.string()),
      requestedAt: v.number(),
      decidedAt: v.optional(v.number()),
      paidAt: v.optional(v.number()),
    }).index("by_user", ["userId", "requestedAt"]).index("by_status", ["status"]),

    conversations: defineTable({
      missionId: v.optional(v.id("missions")),
      bookingId: v.optional(v.id("bookings")),
      participantIds: v.array(v.id("users")),
      lastMessageAt: v.number(),
      lastMessagePreview: v.optional(v.string()),
    })
      .index("by_mission", ["missionId"])
      .index("by_last_message", ["lastMessageAt"]),

    messages: defineTable({
      conversationId: v.id("conversations"),
      senderId: v.optional(v.id("users")), // null = system message
      body: v.string(),
      type: v.union(v.literal("user"), v.literal("system")),
      /** Security classifier result — powers in-app warnings. Never a secret. */
      flags: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }).index("by_conversation", ["conversationId", "createdAt"]),

    notifications: defineTable({
      userId: v.id("users"),
      type: notificationTypeValidator,
      title: v.string(),
      body: v.optional(v.string()),
      link: v.optional(v.string()),
      read: v.optional(v.boolean()),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    reviews: defineTable({
      bookingId: v.id("bookings"),
      missionId: v.id("missions"),
      authorId: v.id("users"),
      targetUserId: v.id("users"),
      rating: v.number(), // 1–5
      punctuality: v.optional(v.number()),
      communication: v.optional(v.number()),
      quality: v.optional(v.number()),
      respect: v.optional(v.number()),
      reliability: v.optional(v.number()),
      comment: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_target", ["targetUserId", "createdAt"])
      .index("by_booking", ["bookingId"]),

    reports: defineTable({
      reporterId: v.id("users"),
      targetType: v.union(v.literal("user"), v.literal("mission"), v.literal("message"), v.literal("booking")),
      targetId: v.string(),
      reason: v.string(),
      description: v.optional(v.string()),
      status: reportStatusValidator,
      priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      createdAt: v.number(),
    }).index("by_status", ["status"]),

    safetyEvents: defineTable({
      userId: v.id("users"),
      bookingId: v.optional(v.id("bookings")),
      type: v.union(v.literal("sos"), v.literal("check_in"), v.literal("check_out"), v.literal("contact_alert")),
      details: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    adminActions: defineTable({
      adminId: v.id("users"),
      action: v.string(),
      targetType: v.optional(v.string()),
      targetId: v.optional(v.string()),
      details: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    // -----------------------------------------------------------------------
    // Security infrastructure
    // -----------------------------------------------------------------------

    /**
     * Server-side security journal. Never stores passwords, tokens or secrets —
     * only the *kind* of event, the actor and coarse metadata.
     */
    securityEvents: defineTable({
      userId: v.optional(v.id("users")), // actor when known
      type: v.string(), // securityEventTypes values
      severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
      targetType: v.optional(v.string()),
      targetId: v.optional(v.string()),
      details: v.optional(v.string()), // human-readable, secret-free
      createdAt: v.number(),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_type", ["type", "createdAt"])
      .index("by_created", ["createdAt"]),

    /**
     * Server-side rate limiting / brute-force protection. One row per
     * (key, windowStart) — the limiter upserts and compares counters.
     */
    rateLimits: defineTable({
      key: v.string(), // e.g. "login:acme@example.com" or "mission:create:<userId>"
      windowStart: v.number(),
      count: v.number(),
      /** Set when a hard block (temporary suspension) is applied to this key. */
      blockedUntil: v.optional(v.number()),
    }).index("by_key", ["key"]),

    /**
     * Step-up verification codes for sensitive operations (bank account
     * changes). Only a salted SHA-256 hash is stored — never the code itself.
     */
    verificationCodes: defineTable({
      userId: v.id("users"),
      purpose: v.union(v.literal("bank_account_change")),
      codeHash: v.string(),
      expiresAt: v.number(),
      attempts: v.number(),
      consumedAt: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_user_purpose", ["userId", "purpose"]),

    /** Fraud review queue: missions auto-flagged by the anti-scam engine. */
    fraudReviews: defineTable({
      missionId: v.id("missions"),
      publisherId: v.id("users"),
      /** 0–100, higher = riskier. */
      score: v.number(),
      reasons: v.array(v.string()),
      status: v.union(v.literal("pending"), v.literal("cleared"), v.literal("confirmed")),
      createdAt: v.number(),
    }).index("by_status", ["status"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------;
export type MissionStatus = Infer<typeof missionStatusValidator>;
