"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Brain,
  Briefcase,
  CheckCircle2,
  HelpCircle,
  MessageSquare,
  Mic,
  Plus,
  Power,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  StickyNote,
} from "lucide-react";

const STEPS = [
  { key: "voice", label: "Voice", icon: Mic, hint: "How replies sound" },
  { key: "career", label: "What you do", icon: Briefcase, hint: "Your profession" },
  { key: "offer", label: "What you sell", icon: ShoppingBag, hint: "Offer / product" },
  { key: "about", label: "About you", icon: Sparkles, hint: "Personal context" },
  { key: "faqs", label: "FAQs", icon: HelpCircle, hint: "Common questions" },
  { key: "never", label: "Never say", icon: ShieldAlert, hint: "Hard no-go's" },
  { key: "default", label: "Default DM", icon: MessageSquare, hint: "Fallback message" },
  { key: "extra", label: "More", icon: StickyNote, hint: "Anything else" },
  { key: "mode", label: "Reply mode", icon: Power, hint: "When to fire" },
] as const;

export default function SetupPage() {
  const accounts = useQuery(api.accounts.list);
  const account = accounts?.[0];
  const setBrand = useMutation(api.accounts.setBrandConfig);
  const setMode = useMutation(api.accounts.setReplyMode);

  const [step, setStep] = useState(0);
  const [brandVoice, setBrandVoice] = useState("");
  const [profession, setProfession] = useState("");
  const [offer, setOffer] = useState("");
  const [brandContext, setBrandContext] = useState("");
  const [commonQuestions, setCommonQuestions] = useState("");
  const [neverSay, setNeverSay] = useState("");
  const [defaultDm, setDefaultDm] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [replyMode, setReplyMode] = useState<
    "off" | "keywords_on_selected_posts" | "all_comments_on_selected_posts" | "all_comments_all_posts"
  >("keywords_on_selected_posts");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!account) return;
    setBrandVoice(account.brandVoice ?? "");
    setProfession((account as any).profession ?? "");
    setOffer((account as any).offer ?? "");
    setBrandContext(account.brandContext ?? "");
    setCommonQuestions((account as any).commonQuestions ?? "");
    setNeverSay((account as any).neverSay ?? "");
    setDefaultDm(account.defaultDmMessage ?? "");
    setExtraNotes((account as any).extraNotes ?? "");
    setReplyMode(account.replyMode);
  }, [account?._id]);

  if (!account) {
    return (
      <div className="card card-pad text-center max-w-md mx-auto">
        <Brain className="w-10 h-10 mx-auto text-fg-faint mb-3" />
        <h1 className="text-xl font-bold">Connect Instagram first</h1>
        <p className="text-sm text-fg-muted mt-2">
          The brain configures how replies sound. Get connected and come back.
        </p>
        <Link href="/" className="btn-primary mt-4 inline-flex">
          Connect →
        </Link>
      </div>
    );
  }

  const save = async (silent = false) => {
    await setBrand({
      id: account._id as any,
      brandVoice: brandVoice || undefined,
      profession: profession || undefined,
      offer: offer || undefined,
      brandContext: brandContext || undefined,
      commonQuestions: commonQuestions || undefined,
      neverSay: neverSay || undefined,
      defaultDmMessage: defaultDm || undefined,
      extraNotes: extraNotes || undefined,
    });
    await setMode({ id: account._id as any, replyMode });
    if (!silent) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <div className="inline-flex items-center gap-2 chip-accent mb-3">
          <Brain className="w-3 h-3" /> Brain
        </div>
        <h1 className="h1">Teach it to speak as you.</h1>
        <p className="text-fg-muted text-sm mt-2 max-w-prose">
          Every field here flows into every DM. The richer the picture, the more replies will sound
          like you actually wrote them. Skip what doesn't apply.
        </p>
      </header>

      <ol className="grid grid-cols-3 md:grid-cols-9 gap-1.5">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={s.key}>
              <button
                onClick={() => setStep(i)}
                className={cn(
                  "w-full flex flex-col items-center gap-1 px-2 py-2 rounded-md text-2xs font-semibold transition text-center",
                  active && "bg-fg text-bg",
                  !active && done && "bg-surface2 text-fg",
                  !active && !done && "bg-surface border border-border text-fg-muted hover:text-fg",
                )}
                title={s.hint}
              >
                <s.icon className="w-3.5 h-3.5" />
                <span className="leading-tight">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <StepCard
          icon={Mic}
          title="How should replies sound?"
          hint='1-3 sentences. e.g. "Lowercase, casual, dry humour, no exclamation marks. Like a friend texting back."'
        >
          <textarea
            className="textarea h-28"
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            placeholder="Describe your voice in your own words. Be specific."
          />
          <Nav onNext={() => setStep(1)} />
        </StepCard>
      )}

      {step === 1 && (
        <StepCard
          icon={Briefcase}
          title="What do you do?"
          hint="Your profession, role, day job, or main thing. Used when someone asks about you."
        >
          <textarea
            className="textarea h-24"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="e.g. I'm a real estate investor in Lagos focused on luxury short-let properties. Day job is X, side project is Y."
          />
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard
          icon={ShoppingBag}
          title="What do you sell or offer?"
          hint="Product, service, course, free guide, link in bio. Referenced when someone asks how to buy, learn, or start."
        >
          <textarea
            className="textarea h-28"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="e.g. I sell a $97 course on building AI agents. Free intro at example.com. Booking calls at calendly.com/..."
          />
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard
          icon={Sparkles}
          title="Anything personal it should know?"
          hint="Background, story, who you help, what makes you different. Stuff that gives replies texture and personality."
        >
          <textarea
            className="textarea h-40"
            value={brandContext}
            onChange={(e) => setBrandContext(e.target.value)}
            placeholder="e.g. I'm Hector, AI engineer based in Lagos. I help solo founders ship AI features without hiring a team. Self-taught, ex-tech-company background."
          />
          <Nav onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </StepCard>
      )}

      {step === 4 && (
        <StepCard
          icon={HelpCircle}
          title="What do people usually ask you?"
          hint="The 3 to 5 questions that come up over and over in DMs. Used to answer accurately when they show up in comments."
        >
          <textarea
            className="textarea h-40"
            value={commonQuestions}
            onChange={(e) => setCommonQuestions(e.target.value)}
            placeholder="e.g.&#10;- How much does it cost? → $97 / one-time&#10;- Do I need to code? → no, but knowing JSON helps&#10;- How do I get started? → link in bio, free 7-day trial"
          />
          <Nav onBack={() => setStep(3)} onNext={() => setStep(5)} />
        </StepCard>
      )}

      {step === 5 && (
        <StepCard
          icon={ShieldAlert}
          title="What should it NEVER say or do?"
          hint="Hard rules. Topics to avoid, claims that aren't true, anything that would damage trust if it slipped out."
        >
          <textarea
            className="textarea h-28"
            value={neverSay}
            onChange={(e) => setNeverSay(e.target.value)}
            placeholder="e.g. Never promise specific income results. Never share my phone number. Never recommend competitors. Never use the word 'literally'."
          />
          <Nav onBack={() => setStep(4)} onNext={() => setStep(6)} />
        </StepCard>
      )}

      {step === 6 && (
        <StepCard
          icon={MessageSquare}
          title="Default DM when nothing else fits"
          hint="Used as a fallback when auto-replies are off and no per-trigger DM was set. Also a starting point that can be adapted on the fly."
        >
          <textarea
            className="textarea h-24"
            placeholder="hey, saw your comment. here's what you asked about..."
            value={defaultDm}
            onChange={(e) => setDefaultDm(e.target.value)}
          />
          <Nav onBack={() => setStep(5)} onNext={() => setStep(7)} />
        </StepCard>
      )}

      {step === 7 && (
        <StepCard
          icon={StickyNote}
          title="Anything else?"
          hint="The free-form catch-all. Quirks, inside info, things you want mentioned when relevant, ongoing context. No structure required."
        >
          <textarea
            className="textarea h-48"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Anything that didn't fit above. Whatever you'd want a smart assistant to know if they were replying to your DMs while you're asleep."
          />
          <Nav onBack={() => setStep(6)} onNext={() => setStep(8)} />
        </StepCard>
      )}

      {step === 8 && (
        <StepCard icon={Power} title="When should it reply?" hint="You can change this any time from the dashboard.">
          <div className="space-y-2 mt-2">
            {(
              [
                ["off", "Off — don't reply yet"],
                ["keywords_on_selected_posts", "Only on keyword matches on enabled posts (recommended)"],
                ["all_comments_on_selected_posts", "Every comment on enabled posts (auto-drafted)"],
                ["all_comments_all_posts", "Every comment on every post (auto-drafted)"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition",
                  replyMode === value
                    ? "border-fg bg-hover"
                    : "border-border hover:bg-hover",
                )}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={replyMode === value}
                  onChange={() => setReplyMode(value)}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <Nav
            onBack={() => setStep(7)}
            onNext={async () => {
              await save();
            }}
            nextLabel="Save brain"
          />
        </StepCard>
      )}

      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>Changes save automatically.</span>
        <button
          className="btn-ghost text-xs h-8"
          onClick={async () => {
            await save();
          }}
        >
          Save now
        </button>
      </div>

      {saved && (
        <div className="fixed bottom-6 right-6 chip-ok px-4 py-2 text-xs">
          <CheckCircle2 className="w-3 h-3" /> Saved
        </div>
      )}
    </div>
  );
}

function StepCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Brain;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-pad space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-surface2 grid place-items-center text-fg shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-fg-muted mt-1">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Next",
}: {
  onBack?: () => void;
  onNext?: () => void | Promise<void>;
  nextLabel?: string;
}) {
  return (
    <div className="flex justify-between pt-2">
      {onBack ? (
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button className="btn-primary" onClick={onNext}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}
