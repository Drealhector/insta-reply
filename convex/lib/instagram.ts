// Thin wrapper around the Instagram Graph API (instagram_business_* scopes).
// All calls hit graph.instagram.com — the consolidated host for the Instagram
// Login path (no Facebook Page intermediary required).

const GRAPH = "https://graph.instagram.com";

export type IgUser = {
  id: string;
  // Page-Scoped ID. Same account, different ID — Meta uses this one in webhook
  // payloads while /me's `id` is the Instagram-scoped User ID. We need both.
  user_id?: string;
  username?: string;
  profile_picture_url?: string;
};

export type IgMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

export type IgComment = {
  id: string;
  text: string;
  username?: string;
  from?: { id: string; username?: string };
  parent_id?: string;
};

async function call<T>(
  path: string,
  init: { method?: string; query?: Record<string, string>; body?: unknown; token: string },
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  if (init.query) for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", init.token);

  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: init.body ? { "content-type": "application/json" } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Instagram API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
    throw new Error(
      `Instagram API ${res.status}: ${err?.message ?? "unknown"} ` +
        `(code ${err?.code ?? "?"}, subcode ${err?.error_subcode ?? "?"})`,
    );
  }
  return json as T;
}

export async function getMe(token: string): Promise<IgUser> {
  return call<IgUser>("/me", {
    query: { fields: "id,user_id,username,profile_picture_url" },
    token,
  });
}

export async function listMedia(token: string, limit = 25): Promise<{ data: IgMedia[]; paging?: { next?: string } }> {
  return call("/me/media", {
    query: {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: String(limit),
    },
    token,
  });
}

export async function getMedia(token: string, mediaId: string): Promise<IgMedia> {
  return call(`/${mediaId}`, {
    query: { fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp" },
    token,
  });
}

export async function getComment(token: string, commentId: string): Promise<IgComment & { media?: { id: string } }> {
  return call(`/${commentId}`, {
    query: { fields: "id,text,username,from,parent_id,media" },
    token,
  });
}

// Public reply to a comment (visible thread reply).
export async function replyToComment(token: string, commentId: string, message: string) {
  return call<{ id: string }>(`/${commentId}/replies`, {
    method: "POST",
    body: { message },
    token,
  });
}

// Private reply: sends a DM to the user who made the comment.
// Must be within 7 days of the comment.
export async function sendPrivateReply(
  token: string,
  igUserId: string,
  commentId: string,
  text: string,
): Promise<{ recipient_id: string; message_id: string }> {
  return call(`/${igUserId}/messages`, {
    method: "POST",
    body: {
      recipient: { comment_id: commentId },
      message: { text },
    },
    token,
  });
}

// Refresh the long-lived Instagram User token (extends another 60 days).
export async function refreshLongLivedToken(token: string): Promise<{ access_token: string; expires_in: number; token_type: string }> {
  return call("/refresh_access_token", {
    query: { grant_type: "ig_refresh_token" },
    token,
  });
}

// Subscribe the IG account to specific webhook fields on the app. This is
// SEPARATE from the app-level webhook URL config in the Meta dashboard —
// without this, even a verified webhook URL receives no events for this user.
// We always (re)subscribe to comments + messages + message_reactions so the
// account-level state matches what the dashboard sets up.
export async function subscribeAccountToApp(
  token: string,
  igUserId: string,
  fields: string[] = ["comments", "messages", "message_reactions"],
): Promise<{ success: boolean }> {
  return call(`/${igUserId}/subscribed_apps`, {
    method: "POST",
    query: { subscribed_fields: fields.join(",") },
    token,
  });
}

export async function getAccountSubscriptions(
  token: string,
  igUserId: string,
): Promise<{ data: { id: string; subscribed_fields: string[] }[] }> {
  return call(`/${igUserId}/subscribed_apps`, { token });
}
