// Minimal OpenAI Chat Completions wrapper. We avoid pulling the openai SDK
// into Convex actions (it can be heavy and pulls Node-specific bits) and just
// hit the HTTP API directly.

const BASE = "https://api.openai.com/v1";

// Hard rule applied to every AI output: never use hyphens or dashes.
// User dislikes them as an AI tell. Belt-and-suspenders: we tell the model
// (which usually obeys) AND strip any that slip through.
const NO_DASH_RULE =
  "ABSOLUTE RULE: Never use the characters '-' (hyphen), '–' (en dash), or '—' (em dash). " +
  "Not for pauses. Not for emphasis. Not for compound words if avoidable. " +
  "Use commas, periods, or split into separate sentences instead. " +
  "Examples — wrong: 'Hey, well-made point — thanks!'. Right: 'Hey, well made point. Thanks!'";

function stripDashes(s: string): string {
  // Replace en/em dashes with commas (they were almost always serving as soft pauses).
  // Replace standalone hyphens (space-dash-space) with commas. Leave intra-word hyphens
  // alone since stripping them mangles legitimate words (e.g. "well-known").
  return s
    .replace(/\s+[–—]\s+/g, ", ")
    .replace(/[–—]/g, ",")
    .replace(/\s-\s/g, ", ")
    .trim();
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export async function chat(
  apiKey: string,
  args: { model?: string; messages: ChatMessage[]; maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: args.model ?? "gpt-4o-mini",
      messages: args.messages,
      temperature: args.temperature ?? 0.5,
      max_tokens: args.maxTokens ?? 400,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content?.trim() ?? "";
}

// Summarise what an Instagram post is about, looking at the image + caption.
// We do this once when a post is synced/enabled so we can reference it later
// when drafting replies, without re-sending the image every time.
export async function summarisePost(
  apiKey: string,
  args: { mediaUrl?: string; caption?: string },
): Promise<string> {
  const userContent: ChatMessage["content"] = [
    {
      type: "text",
      text:
        "Summarise what this Instagram post is about in 2-4 sentences. " +
        "Focus on: what's being shown/discussed, the offer or call-to-action if any, " +
        "and what someone commenting on it is most likely asking. Plain prose, no bullets.\n\n" +
        `Caption:\n${args.caption ?? "(no caption)"}`,
    },
  ];
  if (args.mediaUrl) {
    userContent.push({ type: "image_url", image_url: { url: args.mediaUrl } });
  }

  const out = await chat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You concisely describe social-media posts so a chatbot can answer comments about them.\n\n" +
          NO_DASH_RULE,
      },
      { role: "user", content: userContent },
    ],
  });
  return stripDashes(out);
}

// Draft a private-reply DM to a commenter, using the post summary, brand
// voice, optional per-trigger instructions, and the actual comment text.
export async function draftReplyDm(
  apiKey: string,
  args: {
    postSummary?: string;
    postCaption?: string;
    brandVoice?: string;
    brandContext?: string;
    profession?: string;
    offer?: string;
    commonQuestions?: string;
    neverSay?: string;
    extraNotes?: string;
    triggerInstructions?: string;
    commenterUsername?: string;
    commentText: string;
    fallbackMessage?: string;
  },
): Promise<string> {
  const system = [
    "You ARE the account owner replying to a comment by DM. Not an assistant. Not a bot. Them.",
    "",
    "WRITE LIKE SOMEONE TALKING, NOT TEXTING:",
    "1. Imagine you said this OUT LOUD to the person while walking past them. That's the rhythm.",
    "2. SHORT. 1 sentence ideal, 2 max. Under 200 characters total.",
    "3. Contractions: I'm, you're, it's, that's, I'll. Always.",
    "4. Lowercase is fine if it matches the voice. Sentence case is fine. NEVER ALL-CAPS.",
    "5. No greetings. No 'thanks for your comment'. No 'I'd be happy to help'. No 'feel free to'. Skip the AI tells.",
    "6. No marketing language. No 'check out', 'don't miss', 'limited time'. Talk like a person.",
    "7. No emojis unless the voice clearly uses them. No hashtags. No links unless the trigger provides one.",
    "8. Don't say their @ name. Don't repeat their comment back.",
    "9. If there's nothing real to say, say something short and warm. Don't pad.",
    "",
    NO_DASH_RULE,
    "",
    args.brandVoice && `HOW YOU SOUND:\n${args.brandVoice}`,
    args.profession && `WHAT YOU DO:\n${args.profession}`,
    args.offer && `WHAT YOU SELL / OFFER:\n${args.offer}`,
    args.brandContext && `ABOUT YOU / THE BUSINESS:\n${args.brandContext}`,
    args.commonQuestions && `COMMON QUESTIONS PEOPLE ASK YOU:\n${args.commonQuestions}`,
    args.neverSay && `NEVER SAY / AVOID:\n${args.neverSay}`,
    args.extraNotes && `EXTRA CONTEXT:\n${args.extraNotes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    args.postSummary ? `THE POST THEY COMMENTED ON:\n${args.postSummary}` : "",
    !args.postSummary && args.postCaption ? `POST CAPTION:\n${args.postCaption}` : "",
    args.triggerInstructions ? `EXTRA INSTRUCTIONS FOR THIS TRIGGER:\n${args.triggerInstructions}` : "",
    args.fallbackMessage
      ? `BASE TEMPLATE (you may adapt or replace it):\n"${args.fallbackMessage}"`
      : "",
    `THEIR COMMENT: "${args.commentText}"`,
    "",
    "Write the DM text only. No preamble. No quotes wrapping it. Plain text.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await chat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.6,
    maxTokens: 160,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return stripDashes(out);
}

// Draft a PUBLIC comment-thread reply (replying on the comment itself, visible
// to anyone who sees the post). Two intents:
//
//   "ack"    — keyword matched, we just sent the commenter a DM. The public
//              reply tells them to check their DMs but WITHOUT robotic
//              "DM sent" language. Varied, post-aware, human.
//   "engage" — no keyword, just a friendly contextual response to engage with
//              the comment (no DM sent or implied).
export async function draftPublicReply(
  apiKey: string,
  args: {
    intent: "ack" | "engage";
    postSummary?: string;
    postCaption?: string;
    brandVoice?: string;
    brandContext?: string;
    profession?: string;
    offer?: string;
    extraNotes?: string;
    commenterUsername?: string;
    commentText: string;
  },
): Promise<string> {
  const isAck = args.intent === "ack";

  const ackRules = [
    "INTENT: You just sent this person a DM with what their comment was about. This public reply privately signals to them to check their DMs WITHOUT sounding like an autoresponder.",
    "",
    "STYLE RULES — strict:",
    "1. SHORT. 4 to 12 words. Comment-thread brevity. Never longer.",
    "2. NEVER use these phrases (or close paraphrases): 'DM sent', 'check your DMs', 'check messages', 'sent it', 'sliding into your DMs', 'sent you a DM'. Find a fresher way every single time.",
    "3. Vary the phrasing — every reply must sound noticeably different from a generic template.",
    "4. Reference the post or the commenter's vibe in a small way when natural. Not forced.",
    "5. Sound like a real person glancing at a comment and replying mid-scroll.",
    "6. No greetings, no @ mentions, no exclamation chains, no marketing voice.",
    "",
    "VIBE EXAMPLES (DON'T copy literally — understand the natural-yet-signal pattern):",
    "  comment 'send me the link' → 'in your inbox now'",
    "  comment 'how' → 'answered you privately'",
    "  comment 'becca' → 'replied over there'",
    "  comment 'i need this' → 'just messaged you'",
    "  comment 'where' → 'told you over in messages'",
  ].join("\n");

  const engageRules = [
    "INTENT: Reply naturally to engage with what they said, like you saw it scrolling and wanted to respond. NO DM was sent. NO call to action.",
    "",
    "STYLE RULES — strict:",
    "1. SHORT. 4 to 15 words. Comment-thread brevity.",
    "2. Match the energy of their comment.",
    "3. Reference the post topic if it fits, otherwise just engage with what they actually wrote.",
    "4. Vary the phrasing across comments.",
    "5. No marketing language, no greetings, no '@' mentions, no exclamation chains.",
    "6. NEVER tell them to DM you, check DMs, or take any action.",
    "",
    "VIBE EXAMPLES:",
    "  comment 'love this!' → 'thanks, was a good day'",
    "  comment 'where is this' → 'abuja did its thing that morning'",
    "  comment '🔥🔥' → 'appreciate you'",
    "  comment 'goals' → 'one day at a time'",
  ].join("\n");

  const system = [
    "You ARE the account owner replying to a public Instagram comment. Not an AI. Not an assistant. Them.",
    "",
    isAck ? ackRules : engageRules,
    "",
    NO_DASH_RULE,
    "",
    args.brandVoice && `HOW YOU SOUND:\n${args.brandVoice}`,
    args.profession && `WHAT YOU DO:\n${args.profession}`,
    args.offer && `WHAT YOU SELL / OFFER:\n${args.offer}`,
    args.brandContext && `ABOUT YOU:\n${args.brandContext}`,
    args.extraNotes && `EXTRA CONTEXT:\n${args.extraNotes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    args.postSummary ? `THE POST THEY COMMENTED ON:\n${args.postSummary}` : "",
    !args.postSummary && args.postCaption ? `POST CAPTION:\n${args.postCaption}` : "",
    `THEIR COMMENT: "${args.commentText}"`,
    "",
    "Write the public reply text only. No preamble. No quotes wrapping it. Plain text.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Higher temperature for variety — the user explicitly wants different
  // phrasing every time, not a stock response.
  const out = await chat(apiKey, {
    model: "gpt-4o-mini",
    temperature: 0.95,
    maxTokens: 80,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return stripDashes(out);
}
