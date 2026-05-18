# InstaReply — Setup

Auto-DM Instagram commenters with post-aware, AI-drafted replies. Per-post keyword triggers,
"reply to everything" mode, simulate-comment tool for testing, full logs.

This project is **single-tenant** — one Convex deployment = one Instagram account. If you want
to run InstaReply for multiple IG accounts, create one Convex project per account.

---

## 0. One-time prerequisites

- Node 20+ (`node -v`)
- pnpm or npm (we use pnpm by default — `npm i -g pnpm` if missing)
- An Instagram **Business or Creator** account
- A Meta developer account (free): https://developers.facebook.com/

---

## 1. Create a new, separate Convex team for InstaReply

This keeps InstaReply's usage 100% isolated from any other Convex project you have (e.g. Becca).

1. Open https://dashboard.convex.dev and click your team selector (top-left).
2. Pick **"Create a team"** → name it something like `insta-reply` → free tier is fine.

> You can stay logged in as the same Convex user — teams are just billing/quota boundaries.
> InstaReply on the free tier should comfortably handle thousands of comments/month without overage.

---

## 2. Install + connect Convex

```powershell
cd C:\Users\samym\insta-reply
pnpm install
pnpm convex:dev
```

When the Convex CLI asks:

- **Login** — log in with the same Convex account.
- **Which team?** — choose the new `insta-reply` team you just created (NOT the Becca team).
- **Project** — "Create new project" → name `insta-reply`.
- **Deployment** — "dev" (default).

The CLI will write `NEXT_PUBLIC_CONVEX_URL` to `.env.local` and start syncing your `convex/`
folder. Leave it running in this terminal.

In a **second terminal**:

```powershell
cd C:\Users\samym\insta-reply
pnpm dev
```

Open http://localhost:3000.

---

## 3. Create the Meta app

1. Go to https://developers.facebook.com/apps and **Create app**:
   - Use case: **Other**
   - Type: **Business**
2. Open the new app's dashboard. Under **Add products to your app**, add:
   - **Instagram** (the one labelled "Instagram API with Instagram Login")
3. Open **App Settings → Basic** and copy the **App Secret** — you'll paste it into Convex in
   step 5.
4. Open **App Roles → Roles** and add:
   - Yourself as **Admin** (should be there already).
   - **Add Instagram Testers** — invite the IG accounts you want to test commenting from (your
     own throwaway account, a friend's). Each tester has to accept the invite from their IG
     app's notifications.

> While your app is in **Development** mode (default), webhooks only fire for comments from
> testers. Once **App Review** approves your scopes, it works for everyone. Plan ~1-2 weeks.

---

## 4. Generate the Instagram access token

1. In your Meta app, open **Instagram → API setup with Instagram business login**.
2. Click **Generate access token** → log into the IG account you want to manage → approve the
   permissions. **Required scopes:**
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
3. Copy the long token string (`IGQVJ...`). It's valid for 60 days; InstaReply refreshes it
   automatically every day via a cron.
4. In the InstaReply web app (http://localhost:3000), paste the token into the "Connect your
   Instagram" form. You should see `@your-username` appear in the header.

---

## 5. Set Convex environment variables

In a third terminal (or paste these in the Convex dashboard under Settings → Environment Variables):

```powershell
npx convex env set META_APP_SECRET "<the app secret from Meta App Settings → Basic>"
npx convex env set META_WEBHOOK_VERIFY_TOKEN "any-random-string-you-make-up"
```

`META_APP_SECRET` is used to verify that incoming webhooks are really from Meta (HMAC SHA-256).
`META_WEBHOOK_VERIFY_TOKEN` is just a shared secret you and Meta both know — Meta sends it during
the initial webhook handshake.

---

## 6. Subscribe Meta's webhook to your Convex URL

Your Convex HTTP URL is your deployment URL with `.cloud` swapped for `.site`. Example:

- Convex URL: `https://flowery-mongoose-123.convex.cloud`
- Webhook URL: `https://flowery-mongoose-123.convex.site/instagram/webhook`

In the Meta app dashboard:

1. **Webhooks → Add subscription → Instagram**
2. Callback URL: `https://<your-deployment>.convex.site/instagram/webhook`
3. Verify token: the value you set for `META_WEBHOOK_VERIFY_TOKEN`
4. Click **Verify and save**. Meta will hit your Convex GET endpoint with `hub.challenge` — if
   the verify token matches, it accepts the subscription.
5. After verification, subscribe to the **`comments`** field.

You can also subscribe to `messages` later if you want to handle replies to your sent DMs, but
the bare minimum for "comment → DM" is just `comments`.

---

## 7. Add your OpenAI key + run the setup wizard

1. In the dashboard top-right, paste your OpenAI API key into the "OpenAI key" box and click
   Save.
2. Open **Setup** in the nav and walk through the 4-question wizard (brand voice, business
   context, default DM, reply mode).
3. Open **Posts** → click **Sync from Instagram** to pull in your recent posts.
4. Click a post → toggle "Enabled" → click **Generate** under "What this post is about" so the
   AI builds a summary it can reference when drafting replies.
5. Add one or more **keyword triggers** to the post (e.g. keywords `link, info`, DM template
   `Here's the link!`, AI-personalise on).
6. Use the **Simulate a comment** box at the bottom of the post page to test the matching logic
   without waiting for a real Instagram comment. (Simulation actually sends the DM if you
   provide a real `mediaId` and the test comment author is reachable, so use a throwaway IG
   account first.)

---

## 8. Go live

- While your Meta app is in Development mode, only **Instagram Tester** accounts can trigger
  webhooks. Add testers from **App Roles → Roles → Instagram Testers**.
- For production (anyone can comment and get a DM), submit your app for **App Review** in the
  Meta dashboard. You'll be asked for a screencast showing the flow.

---

## Reply modes (what each one actually does)

| Mode | What triggers a DM |
|---|---|
| `off` | Nothing — webhooks are still received and logged, no DMs. |
| `keywords_on_selected_posts` | Only when a comment on an **enabled** post matches one of that post's triggers. (Recommended for ad campaigns.) |
| `all_comments_on_selected_posts` | Every top-level comment on enabled posts gets an AI-drafted DM (uses brand voice + post summary). |
| `all_comments_all_posts` | Every top-level comment on every post — even ones you haven't enabled. AI-drafted. Use sparingly. |

Per-post **fallback** (set on the post detail page) overrides the keyword-match miss case:

- `inherit` (default) — follow the account mode above
- `ignore` — never DM for non-matches on this post, even in "all comments" mode
- `ai_reply` — even in keyword mode, AI-draft a reply when nothing matched

---

## Local dev / where things live

```
app/                       Next.js dashboard (App Router)
  page.tsx                 Home + connect IG + reply mode
  posts/                   Post grid + per-post config
  triggers/                Flat list across posts
  logs/                    Comments + DMs ledger
  setup/                   4-question wizard + Meta setup help
components/                ConvexClientProvider
convex/
  schema.ts                Database
  accounts.ts              Connect IG, OpenAI key, brand config, token refresh cron
  posts.ts                 Sync from IG, enable/disable, AI summary
  triggers.ts              CRUD for keyword triggers
  comments.ts              Webhook ingestion + the core "match + DM" processor
  http.ts                  /instagram/webhook (GET verify + POST receive)
  crons.ts                 Daily token refresh
  lib/instagram.ts         Thin Graph API wrapper
  lib/openai.ts            Post-summarise + DM-draft helpers
```

---

## Common gotchas

- **"This message is sent outside of allowed window"** — you tried to DM more than 7 days after
  the comment. The Private Replies window is hard-capped by Meta.
- **No comments coming in** — confirm the webhook subscription is **active** in Meta dashboard,
  the verify URL succeeded, and you commented from an account that's an Instagram Tester.
- **DM sent but commenter doesn't see it** — they need to open Instagram Direct and accept the
  message request (first DM from a new sender always goes to "Requests"). This is an Instagram
  UX thing, not something we can change.
- **Token expired** — the cron refreshes daily, but if Convex was paused for >55 days it may
  have expired. Re-paste a fresh token on the home page.
