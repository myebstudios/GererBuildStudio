import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for Gerer Build Studio sync:
 * - settings: user profile, non-sensitive driver configs, and encrypted providerSecrets blob.
 * - agents: non-conversational portable agent fleet definitions (with tombstone delete flags).
 *
 * Both tables are scoped by ownerId (Convex Auth identity subject).
 */
export default defineSchema({
  settings: defineTable({
    ownerId: v.string(),
    profile: v.optional(
      v.object({
        name: v.optional(v.string()),
        email: v.optional(v.string()),
      })
    ),
    // Ciphertext-only payload for providerSecrets and driver configs.
    // Encryption is derived client-side from user sync passphrase.
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
  }).index("by_ownerId", ["ownerId"]),

  agents: defineTable({
    ownerId: v.string(),
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
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_agentKey", ["agentKey"])
    .index("by_ownerId_agentKey", ["ownerId", "agentKey"]),
});
