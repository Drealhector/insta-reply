import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";

export const listForPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    return await ctx.db
      .query("triggers")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
  },
});

export const listForAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    return await ctx.db
      .query("triggers")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
  },
});

export const listForPostInternal = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    return await ctx.db
      .query("triggers")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
  },
});

export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    postId: v.id("posts"),
    keywords: v.array(v.string()),
    matchMode: v.union(v.literal("any"), v.literal("phrase")),
    publicReply: v.optional(v.string()),
    dmMessage: v.string(),
    useAi: v.boolean(),
    aiInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("triggers", {
      ...args,
      keywords: args.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
      enabled: true,
    });
  },
});

// Create the same trigger across many posts in one call. Used by the "Apply
// to multiple posts" workflow on the per-post trigger editor.
export const createBulk = mutation({
  args: {
    accountId: v.id("accounts"),
    postIds: v.array(v.id("posts")),
    keywords: v.array(v.string()),
    matchMode: v.union(v.literal("any"), v.literal("phrase")),
    publicReply: v.optional(v.string()),
    dmMessage: v.string(),
    useAi: v.boolean(),
    aiInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keywords = args.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    const ids = [];
    for (const postId of args.postIds) {
      ids.push(
        await ctx.db.insert("triggers", {
          accountId: args.accountId,
          postId,
          keywords,
          matchMode: args.matchMode,
          publicReply: args.publicReply,
          dmMessage: args.dmMessage,
          useAi: args.useAi,
          aiInstructions: args.aiInstructions,
          enabled: true,
        }),
      );
    }
    return ids;
  },
});

export const update = mutation({
  args: {
    id: v.id("triggers"),
    keywords: v.optional(v.array(v.string())),
    matchMode: v.optional(v.union(v.literal("any"), v.literal("phrase"))),
    publicReply: v.optional(v.string()),
    dmMessage: v.optional(v.string()),
    useAi: v.optional(v.boolean()),
    aiInstructions: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    if (patch.keywords) {
      patch.keywords = patch.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("triggers") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
