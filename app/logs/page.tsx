"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, formatRelative } from "@/lib/utils";
import { useState } from "react";
import { Activity, MessageSquare, AlertCircle } from "lucide-react";

export default function LogsPage() {
  const accounts = useQuery(api.accounts.list);
  const accountId = accounts?.[0]?._id;
  const comments = useQuery(
    api.comments.recent,
    accountId ? { accountId: accountId as any, limit: 100 } : "skip",
  );
  const dms = useQuery(
    api.comments.recentDms,
    accountId ? { accountId: accountId as any, limit: 100 } : "skip",
  );
  const [tab, setTab] = useState<"all" | "comments" | "dms" | "failed">("all");

  if (!accountId) return <p className="text-sm text-fg-muted">Connect Instagram first.</p>;

  type Event =
    | { kind: "comment"; ts: number; data: any }
    | { kind: "dm"; ts: number; data: any };

  const all: Event[] = [
    ...(comments ?? []).map((c) => ({ kind: "comment" as const, ts: c.createdAt, data: c })),
    ...(dms ?? []).map((d) => ({ kind: "dm" as const, ts: d.sentAt, data: d })),
  ].sort((a, b) => b.ts - a.ts);

  const filtered = all.filter((e) => {
    if (tab === "comments") return e.kind === "comment";
    if (tab === "dms") return e.kind === "dm";
    if (tab === "failed") return (e.kind === "dm" && !e.data.success) || (e.kind === "comment" && e.data.status === "failed");
    return true;
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="h1 flex items-center gap-2">
          <Activity className="w-6 h-6" /> Activity
        </h1>
        <p className="text-fg-muted text-sm mt-1">
          Every comment received and every DM sent. Newest first.
        </p>
      </header>

      <div className="flex items-center gap-1 card p-1 w-fit">
        {(
          [
            ["all", "All", all.length],
            ["comments", "Comments", comments?.length ?? 0],
            ["dms", "DMs", dms?.length ?? 0],
            ["failed", "Failed", (dms ?? []).filter((d) => !d.success).length + (comments ?? []).filter((c) => c.status === "failed").length],
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            className={cn(
              "h-7 px-3 rounded text-xs font-medium transition",
              tab === k ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
            )}
            onClick={() => setTab(k as any)}
          >
            {label} <span className="ml-1 text-2xs opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <div className="card divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-10 h-10 mx-auto text-fg-faint mb-3" />
            <p className="font-semibold">Nothing here yet</p>
            <p className="text-sm text-fg-muted mt-1">
              Comments and DMs will appear in real time once replies start firing.
            </p>
          </div>
        ) : (
          filtered.map((e) => (
            <div key={`${e.kind}_${e.data._id}`} className="p-4">
              {e.kind === "comment" ? <CommentRow c={e.data} /> : <DmRow d={e.data} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommentRow({ c }: { c: any }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-fg-faint font-mono">{formatRelative(c.createdAt)}</span>
        <span className="font-semibold text-fg">@{c.fromUsername ?? "?"}</span>
        <span className="text-fg-muted">commented</span>
        <span className={statusChip(c.status)}>{c.status.replace(/_/g, " ")}</span>
        {c.error && (
          <span className="text-accent text-2xs flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {c.error}
          </span>
        )}
      </div>
      <p className="text-sm text-fg/90">"{c.text}"</p>
    </div>
  );
}

function DmRow({ d }: { d: any }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-fg-faint font-mono">{formatRelative(d.sentAt)}</span>
        <MessageSquare className="w-3 h-3 text-fg-muted" />
        <span className={d.success ? "chip-ok" : "chip text-accent"}>
          {d.success ? "DM sent" : "DM failed"}
        </span>
        {d.messageId && (
          <span className="text-fg-faint font-mono text-2xs">{d.messageId.slice(0, 18)}…</span>
        )}
      </div>
      <p className="text-sm text-fg/90">"{d.text || d.error || "—"}"</p>
    </div>
  );
}

function statusChip(status: string) {
  if (status === "processed") return "chip-ok";
  if (status === "failed") return "chip text-accent";
  if (status.startsWith("ignored")) return "chip";
  return "chip-ink";
}
