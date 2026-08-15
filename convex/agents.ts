import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * List all active/tombstoned agents for the authenticated ownerId derived from Convex Auth identity
 */
export const listAgents = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const ownerId = identity.subject;
    return await ctx.db
      .query("agents")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

/**
 * Push/upsert an agent definition for the authenticated ownerId derived from Convex Auth identity
 */
export const pushAgent = mutation({
  args: {
    agentKey: v.string(),
    name: v.string(),
    title: v.string(),
    description: v.string(),
    notifications: v.boolean(),
    color: v.string(),
    mascotExpression: v.optional(v.string()),
    modelSelection: v.optional(v.any()),
    computer: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
    updatedAt: v.number(),
    deleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: Sign-in required to push agents");
    }
    const ownerId = identity.subject;

    const existing = await ctx.db
      .query("agents")
      .withIndex("by_ownerId_agentKey", (q) =>
        q.eq("ownerId", ownerId).eq("agentKey", args.agentKey)
      )
      .first();

    if (existing) {
      if (args.updatedAt >= existing.updatedAt) {
        await ctx.db.patch(existing._id, {
          name: args.name,
          title: args.title,
          description: args.description,
          notifications: args.notifications,
          color: args.color,
          mascotExpression: args.mascotExpression,
          modelSelection: args.modelSelection,
          computer: args.computer,
          pinned: args.pinned,
          hidden: args.hidden,
          updatedAt: args.updatedAt,
          deleted: args.deleted ?? false,
        });
      }
      return existing._id;
    } else {
      return await ctx.db.insert("agents", {
        ownerId,
        agentKey: args.agentKey,
        name: args.name,
        title: args.title,
        description: args.description,
        notifications: args.notifications,
        color: args.color,
        mascotExpression: args.mascotExpression,
        modelSelection: args.modelSelection,
        computer: args.computer,
        pinned: args.pinned,
        hidden: args.hidden,
        updatedAt: args.updatedAt,
        deleted: args.deleted ?? false,
      });
    }
  },
});

/**
 * Tombstone-delete an agent definition for the authenticated ownerId derived from Convex Auth identity
 */
export const deleteAgent = mutation({
  args: {
    agentKey: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated: Sign-in required to delete agents");
    }
    const ownerId = identity.subject;

    const existing = await ctx.db
      .query("agents")
      .withIndex("by_ownerId_agentKey", (q) =>
        q.eq("ownerId", ownerId).eq("agentKey", args.agentKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        deleted: true,
        updatedAt: args.updatedAt,
      });
      return true;
    }
    return false;
  },
});
