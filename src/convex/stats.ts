import { query } from "./_generated/server";
import { requireUser } from "./lib/helpers";

/** Teen dashboard stats. */
export const teenStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .collect();
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_teen", (q) => q.eq("teenId", user._id))
      .collect();
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const completed = bookings.filter((b) => b.status === "completed").length;
    return {
      applicationsTotal: apps.length,
      applicationsPending: apps.filter((a) => a.status === "pending").length,
      bookingsActive: bookings.filter((b) => b.status === "confirmed" || b.status === "in_progress").length,
      missionsCompleted: completed,
      availableCents: wallet?.availableCents ?? 0,
      pendingCents: wallet?.pendingCents ?? 0,
      totalEarnedCents: wallet?.totalEarnedCents ?? 0,
    };
  },
});

/** Adult dashboard stats. */
export const adultStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const missions = await ctx.db
      .query("missions")
      .withIndex("by_publisher", (q) => q.eq("publisherId", user._id))
      .collect();
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_adult", (q) => q.eq("adultId", user._id))
      .collect();
    const missionIds = new Set(missions.map((m) => m._id));
    let applicationsReceived = 0;
    for (const mid of missionIds) {
      const apps = await ctx.db
        .query("applications")
        .withIndex("by_mission", (q) => q.eq("missionId", mid))
        .collect();
      applicationsReceived += apps.length;
    }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const spentThisMonth = bookings
      .filter((b) => b.status === "completed" && (b.updatedAt ?? b.createdAt) >= monthStart)
      .reduce((s, b) => s + b.priceEuros, 0);
    return {
      missionsPublished: missions.length,
      missionsOpen: missions.filter((m) => m.status === "published").length,
      bookingsActive: bookings.filter((b) => b.status === "confirmed" || b.status === "in_progress").length,
      bookingsUpcoming: bookings.filter((b) => b.status === "confirmed").length,
      bookingsCompleted: bookings.filter((b) => b.status === "completed").length,
      applicationsReceived,
      spentThisMonthEuros: Math.round(spentThisMonth * 100) / 100,
    };
  },
});
