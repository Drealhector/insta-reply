"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Grid3x3,
  RefreshCcw,
  Sparkles,
  CheckCircle2,
  Image as ImageIcon,
  Video,
  Layers,
  Search,
} from "lucide-react";

export default function PostsPage() {
  const accounts = useQuery(api.accounts.list);
  const accountId = accounts?.[0]?._id;
  const posts = useQuery(
    api.posts.listForAccount,
    accountId ? { accountId: accountId as any } : "skip",
  );
  const sync = useAction(api.posts.sync);
  const setEnabled = useMutation(api.posts.setEnabled);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!posts) return [];
    let list = posts;
    if (filter === "enabled") list = list.filter((p) => p.enabled);
    if (filter === "disabled") list = list.filter((p) => !p.enabled);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((p) => (p.caption || "").toLowerCase().includes(needle));
    }
    return list;
  }, [posts, filter, q]);

  if (!accountId) {
    return (
      <EmptyState
        icon={Grid3x3}
        title="Connect Instagram first"
        body="Once your account is connected, your posts will sync here for you to enable."
        action={
          <Link href="/" className="btn-primary">
            Go to setup
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="h1">Your posts</h1>
          <p className="text-fg-muted text-sm mt-1">
            Toggle on the posts you want watched. Click any to set up triggers.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              await sync({ accountId: accountId as any, limit: 50 });
            } finally {
              setSyncing(false);
            }
          }}
        >
          <RefreshCcw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync from Instagram"}
        </button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 card p-1">
          {(["all", "enabled", "disabled"] as const).map((f) => (
            <button
              key={f}
              className={cn(
                "h-7 px-3 rounded text-xs font-medium capitalize transition",
                filter === f ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
              )}
              onClick={() => setFilter(f)}
            >
              {f}
              {f !== "all" && (
                <span className="ml-1 text-2xs opacity-70">
                  {posts?.filter((p) => (f === "enabled" ? p.enabled : !p.enabled)).length ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-sm relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="Search caption…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="text-2xs text-fg-muted">
          {filtered.length} of {posts?.length ?? 0}
        </div>
      </div>

      {posts === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton aspect-[4/5]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="No posts synced yet"
          body="Hit Sync from Instagram to pull your latest 50 posts."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches"
          body="Try a different filter or search."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <PostCard
              key={p._id}
              post={p}
              onToggle={(v) => setEnabled({ id: p._id, enabled: v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, onToggle }: { post: any; onToggle: (v: boolean) => void }) {
  const thumb =
    post.mediaType === "VIDEO" ? post.thumbnailUrl ?? post.mediaUrl : post.mediaUrl ?? post.thumbnailUrl;
  const TypeIcon = post.mediaType === "VIDEO" ? Video : post.mediaType === "CAROUSEL_ALBUM" ? Layers : ImageIcon;

  return (
    <div className="group card overflow-hidden hover:shadow-pop transition flex flex-col">
      <Link href={`/posts/${post._id}`} className="block aspect-square bg-surface2 relative">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-fg-muted">
            {post.mediaType}
          </div>
        )}
        <div className="absolute top-2 left-2 chip-ink !bg-fg/80 backdrop-blur-sm">
          <TypeIcon className="w-2.5 h-2.5" />
          {post.mediaType.replace("CAROUSEL_ALBUM", "ALBUM")}
        </div>
        {post.aiSummary && (
          <div className="absolute top-2 right-2 chip-accent backdrop-blur-sm">
            <Sparkles className="w-2.5 h-2.5" />
            Brain ready
          </div>
        )}
        {post.enabled && (
          <div className="absolute bottom-2 right-2 chip-ok backdrop-blur-sm">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Live
          </div>
        )}
      </Link>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-xs text-fg/80 line-clamp-2 h-8">
          {post.caption || <span className="text-fg-faint italic">No caption</span>}
        </p>
        <div className="flex items-center justify-between mt-auto">
          <button
            role="switch"
            aria-checked={post.enabled}
            data-state={post.enabled ? "on" : "off"}
            onClick={() => onToggle(!post.enabled)}
            className="switch"
          >
            <span className="switch-thumb" />
          </button>
          <Link
            href={`/posts/${post._id}`}
            className="text-2xs font-semibold text-fg-muted hover:text-fg uppercase tracking-wide"
          >
            Configure →
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Grid3x3;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card card-pad py-16 text-center">
      <Icon className="w-10 h-10 mx-auto text-fg-faint mb-3" />
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="text-sm text-fg-muted mt-1 mb-5">{body}</p>
      {action}
    </div>
  );
}
