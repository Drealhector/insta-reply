"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRef, useState } from "react";
import { cn, daysUntil, formatRelative } from "@/lib/utils";
import {
  Activity as ActivityIcon,
  CheckCircle2,
  ChevronRight,
  Grid3x3,
  Image as ImageIcon,
  MessageSquare,
  Power,
  RefreshCcw,
  Shield,
  Sparkles,
  Brain,
  Zap,
} from "lucide-react";

export default function Home() {
  const accounts = useQuery(api.accounts.list);
  const account = accounts?.[0];

  if (accounts === undefined) return <PageSkeleton />;
  if (!account) return <ConnectIg />;
  return <Dashboard accountId={account._id as any} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-80" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton h-72" />
    </div>
  );
}

function ConnectIg() {
  const connect = useAction(api.accounts.connect);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="inline-flex items-center gap-2 chip-accent mb-6">
        <Sparkles className="w-3 h-3" /> One-time setup
      </div>
      <h1 className="h1 mb-2">Connect your Instagram</h1>
      <p className="text-fg-muted mb-8">
        Paste your long-lived Instagram User access token. It gets refreshed automatically every day
        so you'll never need to paste it again.
      </p>

      <div className="card card-pad space-y-4">
        <div>
          <label className="label">Instagram access token</label>
          <textarea
            className="textarea font-mono text-xs h-28"
            placeholder="IGAA..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-2xs text-fg-muted mt-1.5">
            Meta App → Instagram → API setup → Generate token.
          </p>
        </div>
        {err && (
          <div className="text-sm text-accent bg-accent-50 px-3 py-2 rounded-md">{err}</div>
        )}
        <div className="flex items-center justify-between pt-2">
          <Link href="/setup" className="text-xs text-fg-muted hover:text-fg">
            Setup help →
          </Link>
          <button
            className="btn-primary"
            disabled={busy || !token.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await connect({ accessToken: token.trim() });
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ accountId }: { accountId: string }) {
  const account = useQuery(api.accounts.getPublic, { id: accountId as any });
  const posts = useQuery(api.posts.listForAccount, { accountId: accountId as any });
  const triggers = useQuery(api.triggers.listForAccount, { accountId: accountId as any });
  const recentComments = useQuery(api.comments.recent, {
    accountId: accountId as any,
    limit: 8,
  });
  const recentDms = useQuery(api.comments.recentDms, {
    accountId: accountId as any,
    limit: 8,
  });
  const syncPosts = useAction(api.posts.sync);
  const setMode = useMutation(api.accounts.setReplyMode);
  const [syncing, setSyncing] = useState(false);
  // Remember the last "on" mode so flipping the master switch back on restores
  // the user's preferred mode instead of always defaulting.
  const lastOnMode = useRef<
    "keywords_on_selected_posts" | "all_comments_on_selected_posts" | "all_comments_all_posts"
  >("keywords_on_selected_posts");

  if (!account) return <PageSkeleton />;
  const enabled = posts?.filter((p) => p.enabled) ?? [];
  const tokenDays = daysUntil(account.tokenExpiresAt);
  const dmsSent = recentDms?.filter((d) => d.success).length ?? 0;
  const repliesOn = account.replyMode !== "off";
  if (repliesOn && account.replyMode !== "off") lastOnMode.current = account.replyMode;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-fg-muted text-sm">@{account.username ?? "your account"}</div>
          <h1 className="h1 mt-0.5">Good to see you back.</h1>
        </div>
        <div className="flex items-center gap-2">
          <MasterSwitch
            on={repliesOn}
            onToggle={(v) =>
              setMode({
                id: accountId as any,
                replyMode: v ? lastOnMode.current : "off",
              })
            }
          />
          <ModeMenu
            current={account.replyMode}
            disabled={!repliesOn}
            onChange={(replyMode) => setMode({ id: accountId as any, replyMode })}
          />
          <button
            className="btn-secondary"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await syncPosts({ accountId: accountId as any, limit: 50 });
              } finally {
                setSyncing(false);
              }
            }}
          >
            <RefreshCcw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            Sync posts
          </button>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <Stat
          label="Posts watched"
          value={`${enabled.length}`}
          sub={`of ${posts?.length ?? 0} synced`}
          icon={Grid3x3}
          href="/posts"
        />
        <Stat
          label="Active triggers"
          value={`${triggers?.length ?? 0}`}
          sub="keyword rules"
          icon={Zap}
          href="/triggers"
        />
        <Stat
          label="DMs sent (recent)"
          value={`${dmsSent}`}
          sub={`of ${recentDms?.length ?? 0} attempts`}
          icon={MessageSquare}
          href="/logs"
        />
        <Stat
          label="Token health"
          value={tokenDays !== null && tokenDays >= 0 ? `${tokenDays}d` : "—"}
          sub={
            tokenDays !== null && tokenDays > 7
              ? "auto-refresh nightly"
              : tokenDays !== null && tokenDays >= 0
              ? "refresh imminent"
              : "expired"
          }
          icon={Shield}
          accent={tokenDays !== null && tokenDays > 7 ? "ok" : "warn"}
        />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="card card-pad lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="h3 flex items-center gap-2">
              <ActivityIcon className="w-3.5 h-3.5" /> Live activity
            </h2>
            <Link href="/logs" className="text-2xs text-fg-muted hover:text-fg">
              View all →
            </Link>
          </div>
          <ActivityFeed comments={recentComments ?? []} dms={recentDms ?? []} />
        </div>

        <div className="card card-pad">
          <h2 className="h3 mb-3 flex items-center gap-2">
            <Brain className="w-3.5 h-3.5" /> Brain
          </h2>
          <p className="text-xs text-fg-muted mb-3">
            How it talks and what it knows about you.
          </p>
          <div className="space-y-2 text-xs">
            <BrainRow label="Voice" value={account.brandVoice} />
            <BrainRow label="About" value={account.brandContext} />
            <BrainRow label="Default DM" value={account.defaultDmMessage} />
          </div>
          <Link
            href="/setup"
            className="btn-secondary mt-4 w-full justify-center text-xs h-8"
          >
            Edit brain →
          </Link>
        </div>
      </section>
    </div>
  );
}

function MasterSwitch({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 card px-3 h-9">
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          on ? "bg-ok animate-pulse-dot" : "bg-fg-faint",
        )}
      />
      <span className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">
        {on ? "Live" : "Off"}
      </span>
      <button
        role="switch"
        aria-checked={on}
        data-state={on ? "on" : "off"}
        onClick={() => onToggle(!on)}
        className="switch"
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Grid3x3;
  href?: string;
  accent?: "ok" | "warn";
}) {
  const body = (
    <div
      className={cn(
        "card card-pad hover:shadow-pop transition group",
        href && "cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className={cn(
            "w-8 h-8 rounded-md grid place-items-center bg-surface2 text-fg-muted",
            accent === "ok" && "bg-ok-soft text-ok",
            accent === "warn" && "bg-warn-soft text-warn",
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        {href && (
          <ChevronRight className="w-4 h-4 text-fg-faint group-hover:text-fg transition" />
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-2xs text-fg-muted mt-0.5 uppercase tracking-wide font-semibold">
        {label}
      </div>
      <div className="text-2xs text-fg-faint mt-0.5">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function ModeMenu({
  current,
  disabled,
  onChange,
}: {
  current: "off" | "keywords_on_selected_posts" | "all_comments_on_selected_posts" | "all_comments_all_posts";
  disabled?: boolean;
  onChange: (mode: any) => void;
}) {
  const LABELS = {
    off: "Off",
    keywords_on_selected_posts: "Keywords only",
    all_comments_on_selected_posts: "All comments / selected",
    all_comments_all_posts: "All comments / all posts",
  } as const;
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="btn-secondary"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? "Replies are off" : "Change reply mode"}
      >
        <Power className="w-3.5 h-3.5" />
        Mode: {LABELS[current]}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-72 card p-1.5 z-30 shadow-pop">
            {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((k) => (
              <button
                key={k}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm hover:bg-hover transition flex items-center justify-between",
                  current === k && "bg-hover font-semibold",
                )}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
              >
                <span>{LABELS[k]}</span>
                {current === k && <CheckCircle2 className="w-4 h-4 text-ok" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BrainRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 text-fg-faint">{label}</span>
      <span className={cn("flex-1 line-clamp-2", value ? "text-fg" : "text-fg-faint italic")}>
        {value || "Not set"}
      </span>
    </div>
  );
}

function ActivityFeed({
  comments,
  dms,
}: {
  comments: any[];
  dms: any[];
}) {
  type Event =
    | { kind: "comment"; ts: number; data: any }
    | { kind: "dm"; ts: number; data: any };
  const events: Event[] = [
    ...comments.map((c) => ({ kind: "comment" as const, ts: c.createdAt, data: c })),
    ...dms.map((d) => ({ kind: "dm" as const, ts: d.sentAt, data: d })),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-fg-muted text-sm">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-fg-faint" />
        Nothing yet. When a comment hits, you'll see it here.
      </div>
    );
  }

  return (
    <ol className="relative space-y-3 pl-5 border-l border-border">
      {events.map((e) => (
        <li key={`${e.kind}_${e.data._id}`} className="relative">
          <span
            className={cn(
              "absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 border-bg",
              e.kind === "comment" ? "bg-fg-faint" : e.data.success ? "bg-ok" : "bg-accent",
            )}
          />
          {e.kind === "comment" ? <CommentRow c={e.data} /> : <DmRow d={e.data} />}
        </li>
      ))}
    </ol>
  );
}

function CommentRow({ c }: { c: any }) {
  return (
    <div className="flex items-baseline gap-2 text-sm flex-wrap">
      <span className="text-2xs text-fg-muted shrink-0 font-mono">{formatRelative(c.createdAt)}</span>
      <span className="font-semibold">@{c.fromUsername ?? "?"}</span>
      <span className="text-fg-muted text-xs">commented</span>
      <span className={statusChip(c.status)}>{c.status.replace(/_/g, " ")}</span>
      <span className="text-fg-muted truncate">"{c.text}"</span>
    </div>
  );
}

function DmRow({ d }: { d: any }) {
  return (
    <div className="flex items-baseline gap-2 text-sm flex-wrap">
      <span className="text-2xs text-fg-muted shrink-0 font-mono">{formatRelative(d.sentAt)}</span>
      <span className="text-fg-muted text-xs">{d.success ? "DM sent" : "DM failed"}</span>
      <span className="text-fg-muted truncate">"{d.text || d.error || "—"}"</span>
    </div>
  );
}

function statusChip(status: string) {
  if (status === "processed") return "chip-ok";
  if (status === "failed") return "chip text-accent";
  if (status.startsWith("ignored")) return "chip";
  return "chip-ink";
}
