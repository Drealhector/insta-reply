import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// --- Meta webhook verification (GET) ----------------------------------------
// When you subscribe a webhook in the Meta dashboard, Meta first sends a GET
// with hub.mode=subscribe and a verify token; we must echo hub.challenge back.
http.route({
  path: "/instagram/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }),
});

// --- Comment events (POST) --------------------------------------------------
// HMAC SHA-256 signature verification using the app secret. We respond 200
// immediately and process the payload asynchronously inside ingestWebhook
// (Meta retries if we don't ack in ~5 seconds).
http.route({
  path: "/instagram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawBody = await req.text();
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const appSecret = process.env.META_APP_SECRET;

    if (!appSecret) {
      console.error("META_APP_SECRET not set");
      return new Response("server misconfigured", { status: 500 });
    }
    const ok = await verifySignature(rawBody, sig, appSecret);
    if (!ok) {
      console.warn("Rejected webhook with bad signature");
      return new Response("bad signature", { status: 401 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new Response("bad json", { status: 400 });
    }

    // Ack immediately; do the work in the background.
    await ctx.scheduler.runAfter(0, internal.comments.ingestWebhook, { body: parsed });
    return new Response("ok", { status: 200 });
  }),
});

export default http;

async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  // header looks like: "sha256=abcdef..."
  const expectedHex = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  if (!expectedHex) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = bufToHex(sig);

  return timingSafeEqual(actualHex, expectedHex);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
