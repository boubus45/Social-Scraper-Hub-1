// Backend platform poster service — uses stored OAuth tokens to post
// Mirrors the frontend platformPosters.ts but runs server-side with stored tokens

import { refreshTokenIfNeeded, getToken } from "./oauthService";

export interface PostResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function encodeFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// ─── Reddit ───────────────────────────────────────────────────────────────

/** Post a self-post to Reddit using a stored OAuth token */
export async function postToReddit(
  content: string,
  userId: string,
  subreddit?: string,
): Promise<PostResult> {
  try {
    const token = await refreshTokenIfNeeded("reddit", userId);
    if (!token) {
      return { ok: false, error: "Reddit not connected. Re-authorize in Settings." };
    }

    // Get username from token lookup (we stored it during OAuth)
    const storedToken = getToken(userId, "reddit");
    const username = "unknown"; // Could store this during OAuth flow

    const sr = subreddit?.replace(/^r\//, "").trim() || `u_${username}`;
    const title = content.split("\n")[0].trim().slice(0, 300);
    const lines = content.trim().split("\n");
    const text = lines.length > 1 ? lines.slice(1).join("\n").trim() : content;

    const res = await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `SocialScraper/1.0 by u/${username}`,
      },
      body: encodeFormBody({
        api_type: "json",
        kind: "self",
        sr,
        title,
        text,
        resubmit: "true",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Reddit submit failed (${res.status}): ${errText}` };
    }

    const json = await res.json() as { json?: { errors?: string[][]; data?: { url?: string } } };
    const errors = json?.json?.errors;
    if (errors && errors.length > 0) {
      return { ok: false, error: `Reddit: ${errors.map(e => e[1]).join(", ")}` };
    }

    return { ok: true, url: json?.json?.data?.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── X / Twitter ──────────────────────────────────────────────────────────

export async function postToX(content: string, userId: string): Promise<PostResult> {
  try {
    const token = await refreshTokenIfNeeded("x", userId);
    if (!token) {
      return { ok: false, error: "X not connected. Re-authorize in Settings." };
    }

    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: content.slice(0, 280) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      return { ok: false, error: `X API error (${res.status}): ${JSON.stringify(body)}` };
    }

    const data = await res.json() as { data?: { id?: string } };
    const tweetId = data?.data?.id;
    return {
      ok: true,
      url: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────

export async function postToLinkedIn(content: string, userId: string): Promise<PostResult> {
  try {
    const token = await refreshTokenIfNeeded("linkedin", userId);
    if (!token) {
      return { ok: false, error: "LinkedIn not connected. Re-authorize in Settings." };
    }

    // LinkedIn requires a person URN; we'd need to fetch this during OAuth
    // For now, return not-implemented
    return { ok: false, error: "LinkedIn posting not yet implemented (needs person URN)." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type PlatformPoster = (content: string, userId: string, extra?: Record<string, string>) => Promise<PostResult>;

export const PLATFORM_POSTERS: Record<string, PlatformPoster> = {
  reddit: (content, userId, extra) => postToReddit(content, userId, extra?.subreddit),
  x: (content, userId) => postToX(content, userId),
  linkedin: (content, userId) => postToLinkedIn(content, userId),
};
