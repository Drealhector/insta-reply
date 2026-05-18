"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { use, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Brain,
  Trash2,
  Zap,
} from "lucide-react";

export default function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const post = useQuery(api.posts.get, { id: id as any });
  const triggers = useQuery(api.triggers.listForPost, { postId: id as any });
  const allPosts = useQuery(
    api.posts.listForAccount,
    post ? { accountId: post.accountId } : "skip",
  );
  const setEnabled = useMutation(api.posts.setEnabled);
  const setFallback = useMutation(api.posts.setFallback);
  const summarise = useAction(api.posts.generateSummary);
  const setSummary = useMutation(api.posts.setSummary);
  const simulate = useAction(api.comments.simulate);
  const create = useMutation(api.triggers.create);
  const createBulk = useMutation(api.triggers.createBulk);
  const update = useMutation(api.triggers.update);
  const remove = useMutation(api.triggers.remove);

  const [simText, setSimText] = useState("");
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [summariseBusy, setSummariseBusy] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [summarySaveBusy, setSummarySaveBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // Edit mode if user is actively typing OR there's no saved summary yet.
  const summaryValue = summaryDraft ?? post?.aiSummary ?? "";
  const summaryDirty = summaryDraft !== null && summaryDraft !== (post?.aiSummary ?? "");

  if (post === undefined) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton h-48" />
      </div>
    );
  }
  if (post === null) return <p>Post not found.</p>;

  const thumb = post.mediaType === "VIDEO" ? post.thumbnailUrl ?? post.mediaUrl : post.mediaUrl ?? post.thumbnailUrl;

  return (
    <div className="space-y-6">
      <Link href="/posts" className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="w-3 h-3" /> All posts
      </Link>

      <header className="grid md:grid-cols-[200px_1fr] gap-6">
        <div className="aspect-square bg-surface2 rounded-xl overflow-hidden">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h1 className="h2 line-clamp-2">
                {post.caption?.slice(0, 100) || "Untitled post"}
                {post.caption && post.caption.length > 100 ? "…" : ""}
              </h1>
              {post.permalink && (
                <a
                  className="text-xs text-fg-muted hover:text-fg underline-offset-2 hover:underline"
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Instagram →
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <button
                  role="switch"
                  aria-checked={post.enabled}
                  data-state={post.enabled ? "on" : "off"}
                  onClick={() => setEnabled({ id: post._id, enabled: !post.enabled })}
                  className="switch"
                >
                  <span className="switch-thumb" />
                </button>
                <span className="font-semibold uppercase tracking-wide text-2xs">
                  {post.enabled ? "Watching" : "Disabled"}
                </span>
              </label>
            </div>
          </div>
          <p className="text-sm text-fg/80 whitespace-pre-wrap line-clamp-6">{post.caption}</p>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-fg-muted">When a comment matches none of the keywords:</label>
            <select
              className="input w-auto text-xs h-7"
              value={post.fallbackBehavior}
              onChange={(e) => setFallback({ id: post._id, fallbackBehavior: e.target.value as any })}
            >
              <option value="inherit">Use account default</option>
              <option value="ignore">Do nothing</option>
              <option value="ai_reply">Reply anyway (auto-drafted)</option>
            </select>
          </div>
        </div>
      </header>

      <section className="card card-pad space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="h3 flex items-center gap-2 mb-1">
              <Brain className="w-3.5 h-3.5" /> What this post is about
            </h2>
            <p className="text-xs text-fg-muted max-w-prose">
              Type your own explanation to keep things tight and cheap, or hit Generate to have it
              drafted from the image and caption. Either way, this is what's referenced when
              writing DMs.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="btn-secondary"
              disabled={summariseBusy || summarySaveBusy}
              title="Draft this from the image and caption"
              onClick={async () => {
                setSummariseBusy(true);
                setSummaryError(null);
                try {
                  await summarise({ postId: post._id });
                  // Drop the local draft so the new value flows in from Convex
                  setSummaryDraft(null);
                } catch (e) {
                  setSummaryError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSummariseBusy(false);
                }
              }}
            >
              <Sparkles className={cn("w-3.5 h-3.5", summariseBusy && "animate-pulse")} />
              {summariseBusy ? "Thinking…" : post.aiSummary ? "Regenerate" : "Auto-generate"}
            </button>
          </div>
        </div>

        <textarea
          className="textarea min-h-[110px] text-sm"
          placeholder="e.g. This post is announcing my new course launch. Commenters usually ask about pricing and what's included. Tell them: $97 one-time, lifetime access, link in bio."
          value={summaryValue}
          onChange={(e) => {
            setSummaryDraft(e.target.value);
            setSummaryError(null);
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="text-2xs text-fg-faint">
            {post.aiSummary
              ? post.aiSummaryUpdatedAt
                ? `Last saved ${new Date(post.aiSummaryUpdatedAt).toLocaleString()}`
                : "Saved"
              : "Not saved yet"}
          </div>
          <div className="flex items-center gap-2">
            {summaryDirty && (
              <button
                className="btn-ghost text-xs h-8"
                onClick={() => setSummaryDraft(null)}
                disabled={summarySaveBusy}
              >
                Discard
              </button>
            )}
            <button
              className="btn-primary"
              disabled={!summaryDirty || summarySaveBusy}
              onClick={async () => {
                if (summaryDraft === null) return;
                setSummarySaveBusy(true);
                setSummaryError(null);
                try {
                  await setSummary({ id: post._id, summary: summaryDraft });
                  setSummaryDraft(null);
                } catch (e) {
                  setSummaryError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSummarySaveBusy(false);
                }
              }}
            >
              {summarySaveBusy ? "Saving…" : summaryDirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        {summaryError && (
          <div className="text-xs text-accent bg-accent-50 px-3 py-2 rounded-md">
            {summaryError}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="h2 flex items-center gap-2">
            <Zap className="w-5 h-5" /> Triggers
          </h2>
          <span className="text-xs text-fg-muted">
            {triggers?.length ?? 0} rule{(triggers?.length ?? 0) === 1 ? "" : "s"} on this post
          </span>
        </div>
        <div className="space-y-3">
          {(triggers ?? []).map((t) => (
            <TriggerCard key={t._id} trigger={t} onUpdate={update} onRemove={remove} />
          ))}
          <NewTriggerForm
            accountId={post.accountId}
            postId={post._id}
            postCaption={post.caption || ""}
            allPosts={allPosts ?? []}
            onCreate={create}
            onCreateBulk={createBulk}
          />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="h3 mb-1 flex items-center gap-2">
          <Send className="w-3.5 h-3.5" /> Test a comment
        </h2>
        <p className="text-xs text-fg-muted mb-3">
          Simulates the full flow with a fake comment. If a trigger matches and a DM is sendable to
          a real recipient, a DM will go out. Use a throwaway username if unsure.
        </p>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder='e.g. "send me the link"'
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={simBusy || !simText.trim()}
            onClick={async () => {
              setSimBusy(true);
              setSimResult(null);
              try {
                const r = await simulate({
                  accountId: post.accountId,
                  mediaId: post.mediaId,
                  text: simText.trim(),
                  fromUsername: "test_user",
                });
                setSimResult(JSON.stringify(r, null, 2));
              } catch (e) {
                setSimResult(e instanceof Error ? e.message : String(e));
              } finally {
                setSimBusy(false);
              }
            }}
          >
            {simBusy ? "Running…" : "Run"}
          </button>
        </div>
        {simResult && (
          <pre className="text-xs font-mono bg-surface2 p-3 rounded-md mt-3 overflow-x-auto whitespace-pre-wrap">
            {simResult}
          </pre>
        )}
      </section>
    </div>
  );
}

function TriggerCard({
  trigger,
  onUpdate,
  onRemove,
}: {
  trigger: any;
  onUpdate: any;
  onRemove: any;
}) {
  const [editing, setEditing] = useState(false);
  const [keywords, setKeywords] = useState(trigger.keywords.join(", "));
  const [matchMode, setMatchMode] = useState(trigger.matchMode);
  const [dmMessage, setDmMessage] = useState(trigger.dmMessage);
  const [publicReply, setPublicReply] = useState(trigger.publicReply ?? "");
  const [useAi, setUseAi] = useState(trigger.useAi);
  const [aiInstructions, setAiInstructions] = useState(trigger.aiInstructions ?? "");

  if (!editing) {
    return (
      <div className="card card-pad">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap gap-1">
              {trigger.keywords.map((k: string) => (
                <span key={k} className="chip-ink font-mono">{k}</span>
              ))}
              {trigger.useAi && (
                <span className="chip-accent">
                  <Sparkles className="w-2.5 h-2.5" /> Personalised
                </span>
              )}
              {trigger.publicReply && <span className="chip">+ public reply</span>}
            </div>
            <p className="text-sm text-fg/90 line-clamp-2">{trigger.dmMessage}</p>
            <p className="text-2xs text-fg-faint">
              Match mode: {trigger.matchMode}
              {trigger.aiInstructions && ` · custom instructions`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button className="btn-icon" title="Edit" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              className="btn-icon hover:text-accent"
              title="Delete"
              onClick={() => onRemove({ id: trigger._id })}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-pad space-y-3">
      <div>
        <label className="label">Keywords (comma separated)</label>
        <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="label">Match mode</label>
          <select
            className="input"
            value={matchMode}
            onChange={(e) => setMatchMode(e.target.value as any)}
          >
            <option value="any">Any token</option>
            <option value="phrase">Exact phrase</option>
          </select>
        </div>
        <div>
          <label className="label">Public reply on the comment {publicReply.trim() && <span className="text-2xs normal-case text-ok ml-1 font-normal tracking-normal">sent verbatim</span>}</label>
          <input
            className="input"
            placeholder="leave blank for auto-drafted natural reply"
            value={publicReply}
            onChange={(e) => setPublicReply(e.target.value)}
          />
          <p className="text-2xs text-fg-faint mt-1">
            Blank = it writes a fresh, varied reply each time that signals "check DMs" naturally based on the post.
          </p>
        </div>
      </div>
      <div>
        <label className="label">DM to send {dmMessage.trim() && <span className="text-2xs normal-case text-ok ml-1 font-normal tracking-normal">sent verbatim</span>}</label>
        <textarea
          className="textarea h-20"
          placeholder="here's the link..."
          value={dmMessage}
          onChange={(e) => setDmMessage(e.target.value)}
        />
        <p className="text-2xs text-fg-faint mt-1">
          Whatever you type goes out exactly as written. Leave blank if you want it auto-drafted instead.
        </p>
      </div>
      {!dmMessage.trim() && (
        <>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span>Auto-draft the DM (uses your brain + post context)</span>
          </label>
          {useAi && (
            <div>
              <label className="label">Guidance for the auto-draft</label>
              <textarea
                className="textarea h-16"
                placeholder="Keep it casual, mention the free trial, never link out…"
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
              />
            </div>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={async () => {
            await onUpdate({
              id: trigger._id,
              keywords: keywords.split(",").map((k: string) => k.trim()).filter(Boolean),
              matchMode,
              dmMessage,
              publicReply: publicReply || undefined,
              useAi,
              aiInstructions: aiInstructions || undefined,
            });
            setEditing(false);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function NewTriggerForm({
  accountId,
  postId,
  postCaption,
  allPosts,
  onCreate,
  onCreateBulk,
}: {
  accountId: string;
  postId: string;
  postCaption: string;
  allPosts: any[];
  onCreate: any;
  onCreateBulk: any;
}) {
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [publicReply, setPublicReply] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [aiInstructions, setAiInstructions] = useState("");
  const [applyToOthers, setApplyToOthers] = useState<string[]>([]);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        className="card w-full p-4 text-sm font-medium text-fg-muted hover:text-fg hover:border-fg/30 border-dashed flex items-center justify-center gap-2 transition"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" />
        Add trigger
      </button>
    );
  }

  const otherPosts = allPosts.filter((p) => p._id !== postId);

  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">New trigger</h3>
        <button className="btn-icon" onClick={() => setOpen(false)}>
          <span aria-hidden>×</span>
        </button>
      </div>

      <div>
        <label className="label">Keywords (comma separated)</label>
        <input
          className="input"
          placeholder="link, info, price"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Public reply on the comment {publicReply.trim() && <span className="text-2xs normal-case text-ok ml-1 font-normal tracking-normal">sent verbatim</span>}</label>
        <input
          className="input"
          placeholder="leave blank for auto-drafted natural reply"
          value={publicReply}
          onChange={(e) => setPublicReply(e.target.value)}
        />
        <p className="text-2xs text-fg-faint mt-1">
          Blank = it writes a fresh, varied reply each time that signals "check DMs" naturally based on the post.
        </p>
      </div>
      <div>
        <label className="label">DM to send {dmMessage.trim() && <span className="text-2xs normal-case text-ok ml-1 font-normal tracking-normal">sent verbatim</span>}</label>
        <textarea
          className="textarea h-20"
          placeholder="here's the link..."
          value={dmMessage}
          onChange={(e) => setDmMessage(e.target.value)}
        />
        <p className="text-2xs text-fg-faint mt-1">
          Whatever you type goes out exactly as written. Leave blank if you want it auto-drafted instead.
        </p>
      </div>
      {!dmMessage.trim() && (
        <>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span>Auto-draft the DM (uses your brain + post context)</span>
          </label>
          {useAi && (
            <div>
              <label className="label">Guidance for the auto-draft</label>
              <textarea
                className="textarea h-16"
                placeholder="Keep it casual, mention the free trial, never link out…"
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">Apply to other posts too</div>
            <div className="text-2xs text-fg-muted">
              Reuse this exact trigger on other posts.{" "}
              {applyToOthers.length > 0 && (
                <span className="text-fg font-semibold">
                  Selected: {applyToOthers.length}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn-secondary text-xs h-8"
            onClick={() => setShowPostPicker((s) => !s)}
          >
            {showPostPicker ? "Done" : "Pick posts"}
          </button>
        </div>
        {showPostPicker && (
          <div className="mt-3 grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
            {otherPosts.map((p) => {
              const selected = applyToOthers.includes(p._id);
              const thumb = p.thumbnailUrl ?? p.mediaUrl;
              return (
                <button
                  key={p._id}
                  onClick={() =>
                    setApplyToOthers((cur) =>
                      cur.includes(p._id) ? cur.filter((id) => id !== p._id) : [...cur, p._id],
                    )
                  }
                  className={cn(
                    "aspect-square rounded-md overflow-hidden border-2 transition relative",
                    selected ? "border-fg" : "border-transparent hover:border-border",
                  )}
                >
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  )}
                  {selected && (
                    <div className="absolute inset-0 bg-fg/30 grid place-items-center">
                      <CheckCircle2 className="w-6 h-6 text-bg" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={saving || !keywords.trim() || !dmMessage.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              const args = {
                accountId,
                keywords: keywords.split(",").map((k: string) => k.trim()).filter(Boolean),
                matchMode: "any" as const,
                dmMessage,
                publicReply: publicReply || undefined,
                useAi,
                aiInstructions: aiInstructions || undefined,
              };
              if (applyToOthers.length > 0) {
                await onCreateBulk({
                  ...args,
                  postIds: [postId, ...applyToOthers],
                });
              } else {
                await onCreate({ ...args, postId });
              }
              setOpen(false);
              setKeywords("");
              setDmMessage("");
              setPublicReply("");
              setAiInstructions("");
              setApplyToOthers([]);
              setShowPostPicker(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving
            ? "Saving…"
            : applyToOthers.length > 0
            ? `Create on ${applyToOthers.length + 1} posts`
            : "Create"}
        </button>
      </div>
    </div>
  );
}
