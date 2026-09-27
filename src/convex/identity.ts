import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getProfile, requireUser } from "./lib/helpers";
import {
  consumeRateLimit,
  logSecurityEvent,
  sanitizeText,
  SECURITY_EVENTS,
} from "./lib/security";

/**
 * À LA PIÈCE — Guardian identity verification.
 *
 * The parental discharge only takes effect once the guardian proves who they
 * are. Three accepted proofs: government ID card, passport, driver's license —
 * or a short video recognition. Files go to Convex file storage through a
 * short-lived upload URL; the document itself is never served publicly and
 * review is done by a human moderator/admin.
 */

const ACCEPTED_KINDS = ["id_card", "passport", "driver_license", "video"] as const;
export type IdentityKind = (typeof ACCEPTED_KINDS)[number];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — enough for a photo/short clip

// ---------------------------------------------------------------------------
// Queries — guardian side
// ---------------------------------------------------------------------------

/** My verification status (sanitized — no file metadata leaks). */
export const myStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = await getProfile(ctx, user._id);
    const verifications = await ctx.db
      .query("identityVerifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(5);
    const latest = verifications[0] ?? null;
    return {
      verified: profile?.guardianIdentityVerified ?? false,
      dischargeAccepted: profile?.parentalDischarge?.accepted ?? false,
      latest: latest
        ? {
            _id: latest._id,
            kind: latest.kind,
            status: latest.status,
            rejectionReason: latest.rejectionReason ?? null,
            submittedAt: latest.submittedAt,
            reviewedAt: latest.reviewedAt ?? null,
          }
        : null,
    };
  },
});

/** Short-lived upload URL for the document (guardian only). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // Rate-limited: prevents storage flooding.
    const rl = await consumeRateLimit(ctx, "identityUpload", user._id);
    if (!rl.ok) {
      throw new Error("Trop de tentatives — réessaie dans quelques minutes.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// ---------------------------------------------------------------------------
// Mutations — guardian side
// ---------------------------------------------------------------------------

/**
 * Submit a document for human review. `fileStored` must come from the upload
 * URL returned by `generateUploadUrl`. Only the storage id is kept.
 */
export const submitDocument = mutation({
  args: {
    kind: v.union(
      v.literal("id_card"),
      v.literal("passport"),
      v.literal("driver_license"),
      v.literal("video"),
    ),
    storageId: v.id("_storage"),
    fileName: v.optional(v.string()),
    /** Teen the discharge covers (when the guardian acts on the teen's device). */
    teenEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rl = await consumeRateLimit(ctx, "identitySubmit", user._id);
    if (!rl.ok) {
      throw new Error("Trop de documents envoyés — réessaie plus tard.");
    }

    const file = await ctx.db.system.get(args.storageId);
    if (!file) throw new Error("FICHIER_INTROUVABLE: renvoie le document.");
    if (file.size > MAX_BYTES) {
      throw new Error("Fichier trop volumineux (10 Mo maximum).");
    }
    if (!file.contentType?.startsWith("image/") && !file.contentType?.startsWith("video/")) {
      throw new Error("Seuls les documents image (JPEG/PNG) ou vidéo sont acceptés.");
    }

    // Resolve the teen covered: explicitly by email, else self when the
    // uploader IS a teen account, else the first linked teen.
    let teenUserId: Id<"users"> | undefined = undefined;
    const email = args.teenEmail?.trim().toLowerCase();
    if (email) {
      const teen = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (!teen) {
        throw new Error("TEEN_INTROUVABLE: aucun compte À LA PIÈCE avec cet email.");
      }
      teenUserId = teen._id;
    } else if (user.accountType === "teen") {
      teenUserId = user._id;
    } else {
      const profile = await getProfile(ctx, user._id);
      teenUserId = profile?.linkedTeenIds?.[0];
    }

    const id = await ctx.db.insert("identityVerifications", {
      userId: user._id,
      teenUserId,
      kind: args.kind,
      storageId: args.storageId,
      fileName: args.fileName ? sanitizeText(args.fileName, 120) : undefined,
      status: "pending",
      submittedAt: Date.now(),
    });

    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.IDENTITY_SUBMITTED,
      severity: "info",
      userId: user._id,
      targetType: "identityVerification",
      targetId: id,
      details: `Document d'identité soumis (${args.kind}).`,
    });

    // Notify moderation queue watchers (all admins) — coarse notification.
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("accountType"), "admin"))
      .take(10);
    for (const admin of admins) {
      await ctx.db.insert("notifications", {
        userId: admin._id,
        type: "safety",
        title: "Vérification d'identité à examiner",
        body: "Un responsable a soumis un document pour activer une décharge parentale.",
        link: "/admin",
        read: false,
        createdAt: Date.now(),
      });
    }

    return { verificationId: id };
  },
});

// ---------------------------------------------------------------------------
// Admin / moderator review
// ---------------------------------------------------------------------------

/** Pending verifications for the review queue (metadata only — no file URL). */
export const reviewQueue = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "admin" && user.accountType !== "moderator") {
      throw new Error("FORBIDDEN: espace réservé à la modération.");
    }
    const rows = await ctx.db
      .query("identityVerifications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(50);
    const result = [];
    for (const row of rows) {
      const submitterProfile = await getProfile(ctx, row.userId);
      const teenProfile = row.teenUserId ? await getProfile(ctx, row.teenUserId) : null;
      result.push({
        _id: row._id,
        kind: row.kind,
        submittedAt: row.submittedAt,
        submitter: submitterProfile?.firstName ?? "Inconnu",
        submitterType: submitterProfile?.accountType ?? null,
        teenName: teenProfile?.firstName ?? null,
      });
    }
    return result;
  },
});

/** Secure, short-lived URL so a reviewer can actually look at the document. */
export const reviewFileUrl = query({
  args: { verificationId: v.id("identityVerifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.accountType !== "admin" && user.accountType !== "moderator") {
      throw new Error("FORBIDDEN");
    }
    const row = await ctx.db.get(args.verificationId);
    if (!row) throw new Error("NOT_FOUND");
    return await ctx.storage.getUrl(row.storageId);
  },
});

/** Approve — activates the discharge on the covered teen's profile. */
export const approve = mutation({
  args: { verificationId: v.id("identityVerifications") },
  handler: async (ctx, args) => {
    const reviewer = await requireUser(ctx);
    if (reviewer.accountType !== "admin" && reviewer.accountType !== "moderator") {
      throw new Error("FORBIDDEN: seule la modération peut valider un document.");
    }
    const row = await ctx.db.get(args.verificationId);
    if (!row || row.status !== "pending") throw new Error("NOT_FOUND_OR_ALREADY_REVIEWED");

    await ctx.db.patch(row._id, {
      status: "approved",
      reviewerId: reviewer._id,
      reviewedAt: Date.now(),
    });

    // Activate the guardian flag on the uploader's profile.
    const uploaderProfile = await getProfile(ctx, row.userId);
    if (uploaderProfile) {
      await ctx.db.patch(uploaderProfile._id, { guardianIdentityVerified: true });
    }

    // Activate the discharge on every teen this document covers.
    // When the document is approved the discharge is confirmed by a human
    // review of the guardian's identity — including legacy teens whose row
    // predates the discharge fields (or whose guardian never ticked the box):
    // the moderation approval *is* the authoritative guardian validation.
    const teenIds = new Set<Id<"users">>();
    if (row.teenUserId) teenIds.add(row.teenUserId);
    const uploader = await ctx.db.get(row.userId);
    if (uploader?.accountType === "teen") teenIds.add(row.userId);
    if (uploaderProfile?.linkedTeenIds) {
      for (const t of uploaderProfile.linkedTeenIds) teenIds.add(t);
    }
    for (const teenId of teenIds) {
      const teenProfile = await getProfile(ctx, teenId);
      if (!teenProfile) continue;
      const wasActive =
        teenProfile.parentalDischarge?.accepted && teenProfile.guardianIdentityVerified === true;
      await ctx.db.patch(teenProfile._id, {
        parentalDischarge: {
          accepted: true,
          guardianName: teenProfile.parentalDischarge?.guardianName ?? "Responsable légal",
          acceptedAt: teenProfile.parentalDischarge?.acceptedAt ?? Date.now(),
        },
        guardianIdentityVerified: true,
      });
      if (!wasActive) {
        await ctx.db.insert("notifications", {
          userId: teenId,
          type: "parent",
          title: "Décharge parentale activée",
          body: "L'identité de ton responsable a été vérifiée : tu peux désormais candidater à toutes les missions.",
          link: "/missions",
          read: false,
          createdAt: Date.now(),
        });
      }
    }

    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.IDENTITY_APPROVED,
      severity: "info",
      userId: reviewer._id,
      targetType: "identityVerification",
      targetId: row._id,
      details: "Document approuvé — décharge parentale activée.",
    });

    return { ok: true };
  },
});

/** Reject — with a reason shown to the guardian so they can retry. */
export const reject = mutation({
  args: { verificationId: v.id("identityVerifications"), reason: v.string() },
  handler: async (ctx, args) => {
    const reviewer = await requireUser(ctx);
    if (reviewer.accountType !== "admin" && reviewer.accountType !== "moderator") {
      throw new Error("FORBIDDEN: seule la modération peut refuser un document.");
    }
    const row = await ctx.db.get(args.verificationId);
    if (!row || row.status !== "pending") throw new Error("NOT_FOUND_OR_ALREADY_REVIEWED");
    await ctx.db.patch(row._id, {
      status: "rejected",
      rejectionReason: sanitizeText(args.reason, 200),
      reviewerId: reviewer._id,
      reviewedAt: Date.now(),
    });
    await ctx.db.insert("notifications", {
      userId: row.userId,
      type: "safety",
      title: "Vérification d'identité refusée",
      body: sanitizeText(args.reason, 200),
      link: "/securite",
      read: false,
      createdAt: Date.now(),
    });
    await logSecurityEvent(ctx, {
      type: SECURITY_EVENTS.IDENTITY_REJECTED,
      severity: "warning",
      userId: reviewer._id,
      targetType: "identityVerification",
      targetId: row._id,
      details: `Document refusé : ${sanitizeText(args.reason, 120)}`,
    });
    return { ok: true };
  },
});
