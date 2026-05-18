import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getComment, replyToComment, sendPrivateReply } from "./lib/instagram";
import { draftPublicReply, draftReplyDm } from "./lib/openai";

// Dashboard reads.
export const recent = query({
  args: { accountId: v.id("accounts"), limit: v.optional(v.number()) },
  handler: async (ctx, { accountId, limit }) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_account_createdAt", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(limit ?? 50);
  },
});

export const recentDms = query({
  args: { accountId: v.id("accounts"), limit: v.optional(v.number()) },
  handler: async (ctx, { accountId, limit }) => {
    return await ctx.db
      .query("dms")
      .withIndex("by_account_sentAt", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(limit ?? 50);
  },
});

// Idempotency check — webhooks can be retried.
export const getByCommentIdInternal = internalQuery({
  args: { commentId: v.string() },
  handler: async (ctx, { commentId }) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_commentId", (q) => q.eq("commentId", commentId))
      .unique();
  },
});

export const insertInternal = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => ctx.db.insert("comments", args),
});

export const updateInternal = internalMutation({
  args: {
    id: v.id("comments"),
    status: v.optional(
      v.union(
        v.literal("received"),
        v.literal("ignored_self"),
        v.literal("ignored_no_post"),
        v.literal("ignored_disabled"),
        v.literal("ignored_no_match"),
        v.literal("processed"),
        v.literal("failed"),
      ),
    ),
    matchedTriggerId: v.optional(v.id("triggers")),
    postId: v.optional(v.id("posts")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const logDmInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    commentId: v.string(),
    recipientId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    text: v.string(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dms", { ...args, sentAt: Date.now() });
  },
});

// --- Core processor -------------------------------------------------------
// Called from the webhook route via an internalAction so the HTTP response
// can return immediately while processing happens in the background.

function matchKeyword(commentText: string, keywords: string[], mode: "any" | "phrase"): boolean {
  if (keywords.length === 0) return false;
  const haystack = ` ${commentText.toLowerCase().replace(/[^\p{L}\p{N}\s@#]/gu, " ")} `;
  if (mode === "phrase") {
    return keywords.some((k) => haystack.includes(` ${k} `) || haystack.includes(k));
  }
  // "any" — comment contains any token from any keyword
  const tokens = new Set(haystack.split(/\s+/).filter(Boolean));
  return keywords.some((k) => k.split(/\s+/).every((t) => tokens.has(t)));
}

export const processComment = internalAction({
  args: {
    accountId: v.id("accounts"),
    igUserId: v.string(),
    mediaId: v.string(),
    commentId: v.string(),
    parentId: v.optional(v.string()),
    fromUserId: v.optional(v.string()),
    fromUsername: v.optional(v.string()),
    text: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // `igUserId` is only used here to look up the account / detect self-comments;
    // it's NOT a field on the comments table, so strip it before any insert.
    const { igUserId: _igUserId, ...insertable } = args;

    // Idempotency: skip if we've already logged this comment.
    const existing = await ctx.runQuery(internal.comments.getByCommentIdInternal, {
      commentId: args.commentId,
    });
    if (existing) return { skipped: "duplicate" };

    const account: Doc<"accounts"> | null = await ctx.runQuery(internal.accounts.getInternal, {
      id: args.accountId,
    });
    if (!account) return { skipped: "no_account" };

    // Skip self-comments (us replying to our own post). Compare against both
    // ID forms since Meta uses one for webhooks and the other for /me.
    if (
      args.fromUserId &&
      (args.fromUserId === account.igUserId || args.fromUserId === account.pageScopedIgId)
    ) {
      await ctx.runMutation(internal.comments.insertInternal, {
        ...insertable,
        status: "ignored_self",
      });
      return { skipped: "self" };
    }

    // Skip replies-to-comments — we only auto-reply to top-level comments
    // on the post itself.
    if (args.parentId) {
      await ctx.runMutation(internal.comments.insertInternal, {
        ...insertable,
        status: "ignored_self",
      });
      return { skipped: "is_reply" };
    }

    // Find the matching post in our DB.
    const post: Doc<"posts"> | null = await ctx.runQuery(internal.posts.getByMediaIdInternal, {
      accountId: args.accountId,
      mediaId: args.mediaId,
    });

    const commentRowId: Id<"comments"> = await ctx.runMutation(internal.comments.insertInternal, {
      ...insertable,
      postId: post?._id,
      status: "received",
    });

    if (account.replyMode === "off") {
      await ctx.runMutation(internal.comments.updateInternal, {
        id: commentRowId,
        status: "ignored_disabled",
      });
      return { skipped: "mode_off" };
    }

    // For modes scoped to selected posts, we need a post record and it must be enabled.
    const scopedToSelected =
      account.replyMode === "keywords_on_selected_posts" ||
      account.replyMode === "all_comments_on_selected_posts";

    if (scopedToSelected) {
      if (!post) {
        await ctx.runMutation(internal.comments.updateInternal, {
          id: commentRowId,
          status: "ignored_no_post",
        });
        return { skipped: "post_not_synced" };
      }
      if (!post.enabled) {
        await ctx.runMutation(internal.comments.updateInternal, {
          id: commentRowId,
          status: "ignored_disabled",
        });
        return { skipped: "post_disabled" };
      }
    }

    // Decide what reply (if any) to send.
    let matchedTrigger: Doc<"triggers"> | null = null;
    let dmText: string | undefined;
    let publicReplyText: string | undefined;
    let useAiNoMatch = false;

    if (post) {
      const triggers = await ctx.runQuery(internal.triggers.listForPostInternal, {
        postId: post._id,
      });
      for (const t of triggers) {
        if (!t.enabled) continue;
        if (matchKeyword(args.text, t.keywords, t.matchMode)) {
          matchedTrigger = t;
          publicReplyText = t.publicReply || undefined;
          dmText = t.dmMessage;
          break;
        }
      }
    }

    const repliesAllComments =
      account.replyMode === "all_comments_on_selected_posts" ||
      account.replyMode === "all_comments_all_posts";

    if (!matchedTrigger && !repliesAllComments) {
      // Keyword-only mode and nothing matched — optionally let the post's
      // fallbackBehavior override.
      if (post?.fallbackBehavior === "ai_reply") {
        useAiNoMatch = true;
      } else {
        await ctx.runMutation(internal.comments.updateInternal, {
          id: commentRowId,
          status: "ignored_no_match",
        });
        return { skipped: "no_match" };
      }
    }

    // Two distinct paths from here:
    //
    //   KEYWORD MATCH:
    //     1. Public reply on the comment — either the trigger's verbatim text
    //        OR an AI-drafted "ack" reply that signals 'check your DMs'
    //        without sounding like a bot (varied phrasing, post-aware).
    //     2. Private DM via Private Replies API — verbatim template if set,
    //        else AI-drafted from brain + post context.
    //
    //   NO KEYWORD (only when account mode is all-comments OR post fallback
    //   is ai_reply):
    //     1. Public reply only — AI-drafted natural engagement with the
    //        comment, post-context aware. No DM.
    try {
      // ---------- PUBLIC REPLY ----------
      let publicText: string | undefined;
      if (matchedTrigger) {
        const trimmedPublic = publicReplyText?.trim();
        if (trimmedPublic) {
          publicText = trimmedPublic;
        } else if (account.openaiApiKey) {
          publicText = await draftPublicReply(account.openaiApiKey, {
            intent: "ack",
            postSummary: post?.aiSummary,
            postCaption: post?.caption,
            brandVoice: account.brandVoice,
            brandContext: account.brandContext,
            profession: account.profession,
            offer: account.offer,
            extraNotes: account.extraNotes,
            commenterUsername: args.fromUsername,
            commentText: args.text,
          });
        }
      } else if ((repliesAllComments || useAiNoMatch) && account.openaiApiKey) {
        publicText = await draftPublicReply(account.openaiApiKey, {
          intent: "engage",
          postSummary: post?.aiSummary,
          postCaption: post?.caption,
          brandVoice: account.brandVoice,
          brandContext: account.brandContext,
          profession: account.profession,
          offer: account.offer,
          extraNotes: account.extraNotes,
          commenterUsername: args.fromUsername,
          commentText: args.text,
        });
      }

      if (publicText && publicText.trim()) {
        try {
          await replyToComment(account.accessToken, args.commentId, publicText.trim());
        } catch (e) {
          // Public reply failure is non-fatal; DM still goes through if applicable.
          console.error("Public reply failed (non-fatal):", e);
        }
      }

      // ---------- DM (keyword matches only) ----------
      // Ordinary comments get the public engagement reply above but NO DM.
      // DMs are reserved for explicit keyword intent.
      if (!matchedTrigger) {
        await ctx.runMutation(internal.comments.updateInternal, {
          id: commentRowId,
          status: "processed",
        });
        return { sent: false, publicReplied: Boolean(publicText) };
      }

      let finalText: string | undefined;
      const templateText = dmText?.trim();
      if (templateText) {
        // User typed an explicit template — respect it absolutely.
        finalText = templateText;
      } else if (account.openaiApiKey && matchedTrigger.useAi) {
        finalText = await draftReplyDm(account.openaiApiKey, {
          postSummary: post?.aiSummary,
          postCaption: post?.caption,
          brandVoice: account.brandVoice,
          brandContext: account.brandContext,
          profession: account.profession,
          offer: account.offer,
          commonQuestions: account.commonQuestions,
          neverSay: account.neverSay,
          extraNotes: account.extraNotes,
          triggerInstructions: matchedTrigger.aiInstructions,
          commenterUsername: args.fromUsername,
          commentText: args.text,
          fallbackMessage: account.defaultDmMessage,
        });
      } else {
        finalText = account.defaultDmMessage;
      }

      if (!finalText || !finalText.trim()) {
        throw new Error("No DM text resolved (no template, no AI key, no fallback).");
      }

      const sent = await sendPrivateReply(
        account.accessToken,
        account.igUserId,
        args.commentId,
        finalText.trim(),
      );

      await ctx.runMutation(internal.comments.logDmInternal, {
        accountId: args.accountId,
        commentId: args.commentId,
        recipientId: sent.recipient_id,
        messageId: sent.message_id,
        text: finalText.trim(),
        success: true,
      });
      await ctx.runMutation(internal.comments.updateInternal, {
        id: commentRowId,
        status: "processed",
        matchedTriggerId: matchedTrigger._id,
      });
      return { sent: true, publicReplied: Boolean(publicText) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.comments.logDmInternal, {
        accountId: args.accountId,
        commentId: args.commentId,
        text: dmText ?? "",
        success: false,
        error: msg,
      });
      await ctx.runMutation(internal.comments.updateInternal, {
        id: commentRowId,
        status: "failed",
        matchedTriggerId: matchedTrigger?._id,
        error: msg,
      });
      return { error: msg };
    }
  },
});

// Manual entry point so you can test a comment without waiting for a webhook
// to fire. The dashboard exposes this as "Simulate comment".
export const simulate = action({
  args: {
    accountId: v.id("accounts"),
    mediaId: v.string(),
    text: v.string(),
    fromUsername: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const account: Doc<"accounts"> | null = await ctx.runQuery(internal.accounts.getInternal, {
      id: args.accountId,
    });
    if (!account) throw new Error("Account not found");
    return await ctx.runAction(internal.comments.processComment, {
      accountId: args.accountId,
      igUserId: account.igUserId,
      mediaId: args.mediaId,
      commentId: `sim_${Date.now()}`,
      fromUsername: args.fromUsername,
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

// Webhook entry — called from the Convex http router after signature check.
export const ingestWebhook = internalAction({
  args: { body: v.any() },
  handler: async (ctx, { body }) => {
    // Instagram webhook payload shape:
    // { object: "instagram", entry: [{ id: <ig-user-id>, time, changes: [{ field: "comments", value: {...} }] }] }
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const igUserId: string = entry.id;
      const account = await ctx.runQuery(internal.accounts.getByIgUserIdInternal, { igUserId });
      if (!account) {
        console.warn(`No account configured for IG user ${igUserId}`);
        continue;
      }
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") continue;
        const v = change.value ?? {};
        // Fetch the full comment if the payload is missing fields.
        let text: string = v.text ?? "";
        let fromUserId: string | undefined = v.from?.id;
        let fromUsername: string | undefined = v.from?.username;
        let parentId: string | undefined = v.parent_id;
        let mediaId: string | undefined = v.media?.id;
        if (!text || !mediaId) {
          try {
            const full = await getComment(account.accessToken, v.id);
            text = text || full.text;
            fromUserId = fromUserId ?? full.from?.id;
            fromUsername = fromUsername ?? full.from?.username ?? full.username;
            parentId = parentId ?? full.parent_id;
            mediaId = mediaId ?? full.media?.id;
          } catch (e) {
            console.error(`Failed to fetch comment ${v.id}:`, e);
            continue;
          }
        }
        if (!mediaId) continue;

        await ctx.runAction(internal.comments.processComment, {
          accountId: account._id,
          igUserId,
          mediaId,
          commentId: v.id,
          parentId,
          fromUserId,
          fromUsername,
          text,
          createdAt: (entry.time ? entry.time * 1000 : Date.now()),
        });
      }
    }
  },
});
