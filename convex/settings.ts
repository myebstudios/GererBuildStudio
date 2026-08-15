import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get user settings for the authenticated ownerId derived from Convex Auth identity
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const ownerId = identity.subject;
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .first();

    return settings;
  },
});

/**
 * Push/upsert user settings for the authenticated ownerId derived from Convex Auth identity
 */
export const pushSettings = mutation({
  args: {
    profile: v.optional(
      v.object({
        name: v.optional(v.string()),
        email: v.optional(v.string()),
      })
    ),
    providerSecrets: v.optional(
      v.object({
        version: v.number(),
        algorithm: v.string(),
        kdf: v.string(),
        iterations: v.number(),
        salt: v.string(),
        iv: v.string(),
        authTag: v.string(),
        ciphertext: v.string(),
      })
    ),
    instances: v.optional(v.any()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: Sign-in required to push settings");
    }
    const ownerId = identity.subject;

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .first();

    if (existing) {
      if (args.updatedAt >= existing.updatedAt) {
        await ctx.db.patch(existing._id, {
          profile: args.profile ?? existing.profile,
          providerSecrets: args.providerSecrets ?? existing.providerSecrets,
          instances: args.instances ?? existing.instances,
          updatedAt: args.updatedAt,
        });
      }
      return existing._id;
    } else {
      const id = await ctx.db.insert("settings", {
        ownerId,
        profile: args.profile,
        providerSecrets: args.providerSecrets,
        instances: args.instances,
        updatedAt: args.updatedAt,
      });
      return id;
    }
  },
});
