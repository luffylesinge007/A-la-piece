import { mutation } from "./_generated/server";
import { AVATAR_ICON_MAP } from "./lib/legacy_icons";

/**
 * One-shot data migration: converts legacy emoji avatars stored in existing
 * profiles to pictogram names. Idempotent — safe to call repeatedly.
 */
export const migrateLegacyAvatars = mutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    let migrated = 0;
    for (const p of profiles) {
      if (p.avatarEmoji && !p.avatarIcon) {
        await ctx.db.patch(p._id, {
          avatarIcon: AVATAR_ICON_MAP[p.avatarEmoji] ?? "user",
          avatarEmoji: undefined,
        });
        migrated += 1;
      }
    }
    return { migrated };
  },
});
