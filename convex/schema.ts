import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  accounts: defineTable({
    igUserId: v.string(),
    // The page-scoped IG ID Meta uses in webhook payloads. Different from
    // `igUserId` (which is the Instagram-scoped ID returned by /me). Both
    // belong to the same account; we look up by either when a webhook arrives.
    pageScopedIgId: v.optional(v.string()),
    username: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    openaiApiKey: v.optional(v.string()),
    connectedAt: v.number(),
    // Brain: how the AI should speak as the user.
    brandVoice: v.optional(v.string()),
    brandContext: v.optional(v.string()),
    profession: v.optional(v.string()),
    offer: v.optional(v.string()),
    commonQuestions: v.optional(v.string()),
    neverSay: v.optional(v.string()),
    extraNotes: v.optional(v.string()),
    defaultDmMessage: v.optional(v.string()),
    replyMode: v.union(
      v.literal("off"),
      v.literal("keywords_on_selected_posts"),
      v.literal("all_comments_on_selected_posts"),
      v.literal("all_comments_all_posts"),
    ),
  })
    .index("by_igUserId", ["igUserId"])
    .index("by_pageScopedIgId", ["pageScopedIgId"]),

  posts: defineTable({
    accountId: v.id("accounts"),
    mediaId: v.string(),
    mediaType: v.string(),
    mediaUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    permalink: v.optional(v.string()),
    caption: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
    aiSummaryUpdatedAt: v.optional(v.number()),
    enabled: v.boolean(),
    fallbackBehavior: v.union(
      v.literal("inherit"),
      v.literal("ignore"),
      v.literal("ai_reply"),
    ),
  })
    .index("by_account", ["accountId"])
    .index("by_account_media", ["accountId", "mediaId"]),

  triggers: defineTable({
    accountId: v.id("accounts"),
    postId: v.id("posts"),
    keywords: v.array(v.string()),
    matchMode: v.union(v.literal("any"), v.literal("phrase")),
    publicReply: v.optional(v.string()),
    dmMessage: v.string(),
    useAi: v.boolean(),
    aiInstructions: v.optional(v.string()),
    enabled: v.boolean(),
  })
    .index("by_post", ["postId"])
    .index("by_account", ["accountId"]),

  comments: defineTable({
    accountId: v.id("accounts"),
    postId: v.optional(v.id("posts")),
    mediaId: v.string(),
    commentId: v.string(),
    parentId: v.optional(v.string()),
    fromUserId: v.optional(v.string()),
    fromUsername: v.optional(v.string()),
    text: v.string(),
    createdAt: v.number(),
    status: v.union(
      v.literal("received"),
      v.literal("ignored_self"),
      v.literal("ignored_no_post"),
      v.literal("ignored_disabled"),
      v.literal("ignored_no_match"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    matchedTriggerId: v.optional(v.id("triggers")),
    error: v.optional(v.string()),
  })
    .index("by_commentId", ["commentId"])
    .index("by_media", ["mediaId"])
    .index("by_account_createdAt", ["accountId", "createdAt"]),

  dms: defineTable({
    accountId: v.id("accounts"),
    commentId: v.string(),
    recipientId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    text: v.string(),
    sentAt: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  })
    .index("by_account_sentAt", ["accountId", "sentAt"])
    .index("by_commentId", ["commentId"]),
});
