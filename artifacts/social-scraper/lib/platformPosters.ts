/**
 * Platform posting helpers used by the scheduled-post executor.
 * Each function is self-contained — no React hooks, no global state.
 */

import { PlatformCredentials } from '@/types';

export interface PostResult {
  ok: boolean;
  url?: string;
  error?: string;
  skipped?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function encodeFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Split content into a Reddit title (≤300 chars, first line) + body text */
function splitRedditContent(content: string): { title: string; text: string } {
  const lines = content.trim().split('\n');
  let title = lines[0].trim().slice(0, 300);
  const rest = lines.slice(1).join('\n').trim();
  // If single-line content is very long, truncate title and use rest as body
  if (lines.length === 1 && content.length > 300) {
    title = content.slice(0, 297) + '…';
    return { title, text: content };
  }
  return { title, text: rest || content };
}

// ─── Reddit ───────────────────────────────────────────────────────────────

/** Obtain a Reddit OAuth2 token via password grant (requires "script" app type). */
export async function getRedditToken(credentials: PlatformCredentials): Promise<string> {
  const { clientId, clientSecret, username, password } = credentials;
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Reddit: clientId, clientSecret, username and password are all required.');
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SocialScraper/1.0 by u/' + username,
    },
    body: encodeFormBody({
      grant_type: 'password',
      username,
      password,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Reddit auth failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(`Reddit auth error: ${json.error}`);
  return json.access_token as string;
}

/**
 * Post a self-post to Reddit.
 * @param content - The full text content to post.
 * @param credentials - Reddit credentials (clientId, clientSecret, username, password).
 * @param subreddit - Subreddit slug to post to (e.g. "programming"). Defaults to user profile "u_{username}".
 */
export async function postToReddit(
  content: string,
  credentials: PlatformCredentials,
  subreddit?: string,
): Promise<PostResult> {
  try {
    const token = await getRedditToken(credentials);
    const sr = subreddit?.replace(/^r\//, '').trim() || `u_${credentials.username}`;
    const { title, text } = splitRedditContent(content);

    const res = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `SocialScraper/1.0 by u/${credentials.username}`,
      },
      body: encodeFormBody({
        api_type: 'json',
        kind: 'self',
        sr,
        title,
        text,
        resubmit: 'true',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.status.toString());
      throw new Error(`Reddit submit failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const errors = json?.json?.errors;
    if (errors && errors.length > 0) {
      throw new Error(`Reddit: ${errors.map((e: string[]) => e[1]).join(', ')}`);
    }

    const url = json?.json?.data?.url as string | undefined;
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── X / Twitter ──────────────────────────────────────────────────────────

/** Generate a nonce for OAuth 1.0a */
function generateNonce(): string {
  const arr = new Uint8Array(16);
  for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Percent-encode per RFC 3986 */
function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Post a tweet via X API v2 using OAuth 1.0a User Context.
 * Requires: apiKey, apiSecret, accessToken, accessTokenSecret.
 */
export async function postToX(
  content: string,
  credentials: PlatformCredentials,
): Promise<PostResult> {
  try {
    const { apiKey, apiSecret, accessToken, accessTokenSecret } = credentials;
    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      return {
        ok: false,
        skipped: true,
        error: 'X: apiKey, apiSecret, accessToken and accessTokenSecret are required.',
      };
    }

    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: ts,
      oauth_token: accessToken,
      oauth_version: '1.0',
    };

    // Build signature base string
    const sigParams = Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
      .join('&');

    const sigBase = `${method}&${pctEncode(url)}&${pctEncode(sigParams)}`;
    const sigKey = `${pctEncode(apiSecret)}&${pctEncode(accessTokenSecret)}`;

    // HMAC-SHA1 using SubtleCrypto (available in React Native via Hermes)
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(sigKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(sigBase));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    const authHeader = 'OAuth ' + [
      ...Object.entries(oauthParams),
      ['oauth_signature', signature],
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
      .join(', ');

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: content.slice(0, 280) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(`X API error (${res.status}): ${body?.detail ?? body?.title ?? JSON.stringify(body)}`);
    }

    const data = await res.json();
    const tweetId = data?.data?.id as string | undefined;
    return {
      ok: true,
      url: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

import { PlatformId } from '@/types';

export type PlatformPoster = (
  content: string,
  credentials: PlatformCredentials,
  extra?: Record<string, string>,
) => Promise<PostResult>;

export const PLATFORM_POSTERS: Partial<Record<PlatformId, PlatformPoster>> = {
  reddit: (content, creds, extra) => postToReddit(content, creds, extra?.subreddit),
  x: (content, creds) => postToX(content, creds),
};

/** Returns true if a platform has enough credentials to attempt auto-posting */
export function hasPostingCredentials(platform: PlatformId, credentials: PlatformCredentials): boolean {
  if (platform === 'reddit') {
    return !!(credentials.clientId && credentials.clientSecret && credentials.username && credentials.password);
  }
  if (platform === 'x') {
    return !!(credentials.apiKey && credentials.apiSecret && credentials.accessToken && credentials.accessTokenSecret);
  }
  return false;
}
