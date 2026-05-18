import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getMe, refreshLongLivedToken, subscribeAccountToApp } from "./lib/instagram";

// Public: list all accounts (we're single-tenant per Convex deployment, but
// the dashboard still queries via a list to handle the "not yet connected" state).
export const list = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    return accounts.map((a) => ({
      _id: a._id,
      igUserId: a.igUserId,
      username: a.username,
      profilePictureUrl: a.profilePictureUrl,
      hasOpenAiKey: Boolean(a.openaiApiKey),
      tokenExpiresAt: a.tokenExpiresAt,
      connectedAt: a.connectedAt,
      brandVoice: a.brandVoice,
      brandContext: a.brandContext,
      defaultDmMessage: a.defaultDmMessage,
      replyMode: a.replyMode,
    }));
  },
});

export const getPublic = query({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    const a = await ctx.db.get(id);
    if (!a) return null;
    return {
      _id: a._id,
      igUserId: a.igUserId,
      username: a.username,
      profilePictureUrl: a.profilePictureUrl,
      hasOpenAiKey: Boolean(a.openaiApiKey),
      tokenExpiresAt: a.tokenExpiresAt,
      brandVoice: a.brandVoice,
      brandContext: a.brandContext,
      profession: a.profession,
      offer: a.offer,
      commonQuestions: a.commonQuestions,
      neverSay: a.neverSay,
      extraNotes: a.extraNotes,
      defaultDmMessage: a.defaultDmMessage,
      replyMode: a.replyMode,
    };
  },
});

// Internal: full record including secrets — used by actions only.
export const getInternal = internalQuery({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getByIgUserIdInternal = internalQuery({
  args: { igUserId: v.string() },
  handler: async (ctx, { igUserId }) => {
    // Look up by either the Instagram-scoped ID (igUserId, from /me) or the
    // Page-Scoped ID (pageScopedIgId, what Meta puts in webhook payloads).
    // Same account, different identifiers — Meta's two ID schemes coexist.
    const byPrimary = await ctx.db
      .query("accounts")
      .withIndex("by_igUserId", (q) => q.eq("igUserId", igUserId))
      .unique();
    if (byPrimary) return byPrimary;
    return await ctx.db
      .query("accounts")
      .withIndex("by_pageScopedIgId", (q) => q.eq("pageScopedIgId", igUserId))
      .unique();
  },
});

export const upsertInternal = internalMutation({
  args: {
    igUserId: v.string(),
    pageScopedIgId: v.optional(v.string()),
    username: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_igUserId", (q) => q.eq("igUserId", args.igUserId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        pageScopedIgId: args.pageScopedIgId ?? existing.pageScopedIgId,
        username: args.username ?? existing.username,
        profilePictureUrl: args.profilePictureUrl ?? existing.profilePictureUrl,
        accessToken: args.accessToken,
        tokenExpiresAt: args.tokenExpiresAt ?? existing.tokenExpiresAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("accounts", {
      igUserId: args.igUserId,
      pageScopedIgId: args.pageScopedIgId,
      username: args.username,
      profilePictureUrl: args.profilePictureUrl,
      accessToken: args.accessToken,
      tokenExpiresAt: args.tokenExpiresAt,
      connectedAt: Date.now(),
      replyMode: "keywords_on_selected_posts",
    });
  },
});

// Public: connect Instagram by pasting a long-lived token. We validate it by
// hitting /me, then store the account.
export const connect = action({
  args: { accessToken: v.string() },
  handler: async (ctx, { accessToken }): Promise<{ _id: Id<"accounts">; igUserId: string; username: string | undefined }> => {
    const me = await getMe(accessToken);
    const id: Id<"accounts"> = await ctx.runMutation(internal.accounts.upsertInternal, {
      igUserId: me.id,
      pageScopedIgId: me.user_id, // Meta uses this one in webhook payloads
      username: me.username,
      profilePictureUrl: me.profile_picture_url,
      accessToken,
      // Long-lived IG tokens last 60 days; refresh job will keep them alive.
      tokenExpiresAt: Date.now() + 55 * 24 * 60 * 60 * 1000,
    });

    // Account-level webhook field subscription. Separate from the app-level
    // webhook URL config in Meta dashboard — without this, the verified
    // webhook URL receives zero events for this user even though the dashboard
    // looks "subscribed". Idempotent: safe to call on reconnects.
    try {
      await subscribeAccountToApp(accessToken, me.id);
    } catch (e) {
      console.error(`subscribeAccountToApp failed for ${me.id}:`, e);
    }

    return { _id: id, igUserId: me.id, username: me.username };
  },
});

export const setOpenAiKey = mutation({
  args: { id: v.id("accounts"), apiKey: v.string() },
  handler: async (ctx, { id, apiKey }) => {
    await ctx.db.patch(id, { openaiApiKey: apiKey.trim() || undefined });
  },
});

export const setBrandConfig = mutation({
  args: {
    id: v.id("accounts"),
    brandVoice: v.optional(v.string()),
    brandContext: v.optional(v.string()),
    profession: v.optional(v.string()),
    offer: v.optional(v.string()),
    commonQuestions: v.optional(v.string()),
    neverSay: v.optional(v.string()),
    extraNotes: v.optional(v.string()),
    defaultDmMessage: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await ctx.db.patch(id, rest);
  },
});

export const setReplyMode = mutation({
  args: {
    id: v.id("accounts"),
    replyMode: v.union(
      v.literal("off"),
      v.literal("keywords_on_selected_posts"),
      v.literal("all_comments_on_selected_posts"),
      v.literal("all_comments_all_posts"),
    ),
  },
  handler: async (ctx, { id, replyMode }) => {
    await ctx.db.patch(id, { replyMode });
  },
});

export const disconnect = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    // Cascade: posts, triggers, comments, dms tied to this account.
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_account", (q) => q.eq("accountId", id))
      .collect();
    for (const p of posts) await ctx.db.delete(p._id);
    const triggers = await ctx.db
      .query("triggers")
      .withIndex("by_account", (q) => q.eq("accountId", id))
      .collect();
    for (const t of triggers) await ctx.db.delete(t._id);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_account_createdAt", (q) => q.eq("accountId", id))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    const dms = await ctx.db
      .query("dms")
      .withIndex("by_account_sentAt", (q) => q.eq("accountId", id))
      .collect();
    for (const d of dms) await ctx.db.delete(d._id);
    await ctx.db.delete(id);
  },
});

// Cron: refresh long-lived tokens before they expire.
export const refreshTokens = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const accounts: Doc<"accounts">[] = (await ctx.runQuery(internal.accounts.listAllInternal, {})) ?? [];
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    for (const a of accounts) {
      if (!a.tokenExpiresAt || a.tokenExpiresAt - now > oneWeek) continue;
      try {
        const refreshed = await refreshLongLivedToken(a.accessToken);
        await ctx.runMutation(internal.accounts.upsertInternal, {
          igUserId: a.igUserId,
          username: a.username,
          profilePictureUrl: a.profilePictureUrl,
          accessToken: refreshed.access_token,
          tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
        });
      } catch (e) {
        console.error(`Token refresh failed for ${a.igUserId}:`, e);
      }
    }
  },
});

export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("accounts").collect(),
});
