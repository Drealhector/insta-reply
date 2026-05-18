import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { listMedia, getMedia } from "./lib/instagram";
import { summarisePost } from "./lib/openai";
import type { Doc, Id } from "./_generated/dataModel";

export const listForAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("posts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getByMediaIdInternal = internalQuery({
  args: { accountId: v.id("accounts"), mediaId: v.string() },
  handler: async (ctx, { accountId, mediaId }) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_account_media", (q) => q.eq("accountId", accountId).eq("mediaId", mediaId))
      .unique();
  },
});

export const upsertManyInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    items: v.array(
      v.object({
        mediaId: v.string(),
        mediaType: v.string(),
        mediaUrl: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        permalink: v.optional(v.string()),
        caption: v.optional(v.string()),
        timestamp: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { accountId, items }) => {
    for (const item of items) {
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_account_media", (q) =>
          q.eq("accountId", accountId).eq("mediaId", item.mediaId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          mediaType: item.mediaType,
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl,
          permalink: item.permalink,
          caption: item.caption,
          timestamp: item.timestamp,
        });
      } else {
        await ctx.db.insert("posts", {
          accountId,
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          mediaUrl: item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl,
          permalink: item.permalink,
          caption: item.caption,
          timestamp: item.timestamp,
          enabled: false,
          fallbackBehavior: "inherit",
        });
      }
    }
  },
});

export const setEnabled = mutation({
  args: { id: v.id("posts"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    await ctx.db.patch(id, { enabled });
  },
});

export const setFallback = mutation({
  args: {
    id: v.id("posts"),
    fallbackBehavior: v.union(
      v.literal("inherit"),
      v.literal("ignore"),
      v.literal("ai_reply"),
    ),
  },
  handler: async (ctx, { id, fallbackBehavior }) => {
    await ctx.db.patch(id, { fallbackBehavior });
  },
});

export const setSummaryInternal = internalMutation({
  args: { id: v.id("posts"), summary: v.string() },
  handler: async (ctx, { id, summary }) => {
    await ctx.db.patch(id, { aiSummary: summary, aiSummaryUpdatedAt: Date.now() });
  },
});

// Public mutation so the user can type their own context for a post and save
// it WITHOUT burning OpenAI tokens. Writes to the same `aiSummary` field so
// the comment-processor sees it the same way as an AI-generated one.
export const setSummary = mutation({
  args: { id: v.id("posts"), summary: v.string() },
  handler: async (ctx, { id, summary }) => {
    const trimmed = summary.trim();
    await ctx.db.patch(id, {
      aiSummary: trimmed || undefined,
      aiSummaryUpdatedAt: trimmed ? Date.now() : undefined,
    });
  },
});

// Pull the latest N posts from Instagram for this account.
export const sync = action({
  args: { accountId: v.id("accounts"), limit: v.optional(v.number()) },
  handler: async (ctx, { accountId, limit }): Promise<{ synced: number }> => {
    const account: Doc<"accounts"> | null = await ctx.runQuery(internal.accounts.getInternal, { id: accountId });
    if (!account) throw new Error("Account not found");
    const result = await listMedia(account.accessToken, limit ?? 25);
    await ctx.runMutation(internal.posts.upsertManyInternal, {
      accountId,
      items: result.data.map((m) => ({
        mediaId: m.id,
        mediaType: m.media_type,
        mediaUrl: m.media_url,
        thumbnailUrl: m.thumbnail_url,
        permalink: m.permalink,
        caption: m.caption,
        timestamp: m.timestamp,
      })),
    });
    return { synced: result.data.length };
  },
});

// Generate (or refresh) the AI summary of a single post so future replies can
// reference it without re-uploading the image every time. Instagram CDN URLs
// are signed and short-lived, and OpenAI's image-download path fails on them
// (the URL params get URL-encoded by Meta in a way that breaks the signature
// check). So we fetch the image ourselves with our own User-Agent — Instagram
// serves it back — and inline it as a base64 data URI for OpenAI.
export const generateSummary = action({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }): Promise<string> => {
    const post: Doc<"posts"> | null = await ctx.runQuery(internal.posts.getInternalById, { id: postId });
    if (!post) throw new Error("Post not found");
    const account: Doc<"accounts"> | null = await ctx.runQuery(internal.accounts.getInternal, { id: post.accountId });
    if (!account) throw new Error("Account not found");
    if (!account.openaiApiKey) throw new Error("No OpenAI key set on this account");

    const rawUrl = post.mediaType === "VIDEO" ? post.thumbnailUrl : post.mediaUrl ?? post.thumbnailUrl;
    let mediaDataUrl: string | undefined;
    if (rawUrl) {
      try {
        mediaDataUrl = await fetchAsDataUrl(rawUrl);
      } catch (e) {
        console.warn(`Image fetch failed for post ${postId}, falling back to caption-only:`, e);
      }
    }

    const summary = await summarisePost(account.openaiApiKey, {
      mediaUrl: mediaDataUrl,
      caption: post.caption,
    });
    await ctx.runMutation(internal.posts.setSummaryInternal, { id: postId, summary });
    return summary;
  },
});

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // Standard browser UA — Instagram CDN serves these without question.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      accept: "image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 18 * 1024 * 1024) throw new Error("Image too large for OpenAI");
  let mime = res.headers.get("content-type") || "image/jpeg";
  // OpenAI doesn't accept webp directly in some flows; jpeg is safest fallback
  // but webp is supported on current gpt-4o-mini, so leave it as-is unless we hit issues.
  if (mime.includes("html")) mime = "image/jpeg";
  const base64 = arrayBufferToBase64(buf);
  return `data:${mime};base64,${base64}`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Convex action runtime exposes Buffer; use it for fast base64 conversion.
  // Fallback to manual loop if Buffer is unavailable for some reason.
  try {
    // @ts-ignore — Buffer is present in Convex's Node-compat actions runtime
    return Buffer.from(buf).toString("base64");
  } catch {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}

export const getInternalById = internalQuery({
  args: { id: v.id("posts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});
