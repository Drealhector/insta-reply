"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";

export default function TriggersPage() {
  const accounts = useQuery(api.accounts.list);
  const accountId = accounts?.[0]?._id;
  const triggers = useQuery(
    api.triggers.listForAccount,
    accountId ? { accountId: accountId as any } : "skip",
  );
  const posts = useQuery(
    api.posts.listForAccount,
    accountId ? { accountId: accountId as any } : "skip",
  );

  if (!accountId) return <p className="text-sm text-fg-muted">Connect Instagram first.</p>;
  if (triggers === undefined || posts === undefined)
    return <div className="skeleton h-32" />;

  const postsById = new Map(posts.map((p) => [p._id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1 flex items-center gap-2">
          <Zap className="w-6 h-6" /> All triggers
        </h1>
        <p className="text-fg-muted text-sm mt-1">
          Every keyword rule across every post. Click a row to jump to its post's configuration.
        </p>
      </div>

      <div className="card divide-y divide-border">
        {triggers.length === 0 && (
          <div className="p-12 text-center">
            <Zap className="w-10 h-10 mx-auto text-fg-faint mb-3" />
            <p className="font-semibold">No triggers yet</p>
            <p className="text-sm text-fg-muted mt-1">
              Go to{" "}
              <Link href="/posts" className="text-fg underline-offset-2 hover:underline">
                Posts
              </Link>{" "}
              and add one.
            </p>
          </div>
        )}
        {triggers.map((t) => {
          const post = postsById.get(t.postId);
          const thumb = post?.thumbnailUrl ?? post?.mediaUrl;
          return (
            <Link
              key={t._id}
              href={`/posts/${t.postId}`}
              className="flex items-center gap-4 p-4 hover:bg-hover transition"
            >
              <div className="w-14 h-14 rounded-md bg-surface2 overflow-hidden flex-shrink-0">
                {thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1">
                  {t.keywords.map((k) => (
                    <span key={k} className="chip-ink font-mono">{k}</span>
                  ))}
                  {t.useAi && (
                    <span className="chip-accent">
                      <Sparkles className="w-2.5 h-2.5" /> Personalised
                    </span>
                  )}
                </div>
                <p className="text-sm text-fg/80 line-clamp-1 mt-1">{t.dmMessage}</p>
                {post?.caption && (
                  <p className="text-2xs text-fg-faint line-clamp-1 mt-0.5">
                    on: {post.caption.slice(0, 80)}
                  </p>
                )}
              </div>
              <div className="text-2xs text-fg-muted shrink-0">
                {t.enabled ? "Live" : "Paused"}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
