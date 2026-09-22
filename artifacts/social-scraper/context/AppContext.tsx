import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AITone,
  AppSettings,
  ComposedPost,
  Draft,
  PlatformCredentials,
  PlatformId,
  Post,
} from '@/types';
import { Alert } from 'react-native';
import { PLATFORM_POSTERS, hasPostingCredentials, getRedditToken, PostResult } from '@/lib/platformPosters';
import { PLATFORMS } from '@/constants/platforms';
import { refreshInstagramMonitor, MONITOR_ID_KEY } from '@/lib/instagramMonitorApi';
import { refreshRedditMonitor, REDDIT_MONITOR_ID_KEY } from '@/lib/redditMonitorApi';
import { refreshFacebookMonitor, MONITOR_ID_KEY as FACEBOOK_MONITOR_ID_KEY } from '@/lib/facebookMonitorApi';
import { fetchBrightDataProfile } from '@/lib/brightDataApi';

const STORAGE_KEY = '@socialscraper/settings';
const POSTS_KEY = '@socialscraper/posts';
const DRAFTS_KEY = '@socialscraper/drafts';

const defaultSettings: AppSettings = {
  profile: { name: '', handle: '', bio: '' },
  ai: { provider: 'openai', model: 'gpt-4o-mini', apiKey: '' },
  platforms: {
    x: { fetchEnabled: false, postEnabled: false, useApi: false, credentials: {}, followedAccounts: [] },
    reddit: { fetchEnabled: true, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    linkedin: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    facebook: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    instagram: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    tiktok: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
  },
  fetchFrequency: 'manual',
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/** Decode HTML entities that Reddit encodes in preview URLs (e.g. &amp; → &) */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/** Extract image / video URLs from a Reddit post's JSON data */
function extractRedditMedia(p: Record<string, unknown>): string[] {
  const media: string[] = [];

  // Direct image link
  const rawUrl = p.url as string | undefined;
  if (rawUrl && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(rawUrl)) {
    media.push(rawUrl);
  }

  // Preview image (high-res; Reddit HTML-encodes the URL) — decode before dedup/push
  const preview = p.preview as Record<string, unknown> | undefined;
  if (preview) {
    const images = preview.images as Array<{ source: { url: string } }> | undefined;
    const rawPreviewUrl = images?.[0]?.source?.url;
    if (rawPreviewUrl) {
      const decoded = decodeHtmlEntities(rawPreviewUrl);
      if (!media.includes(decoded)) media.push(decoded);
    }
  }

  // Reddit-hosted video (including crossposts / secure_media)
  if (p.is_video) {
    const redditMedia = (p.media ?? p.secure_media) as Record<string, unknown> | undefined;
    const redditVideo = redditMedia?.reddit_video as Record<string, string> | undefined;
    if (redditVideo?.fallback_url) {
      media.push(decodeHtmlEntities(redditVideo.fallback_url));
    } else {
      // Crossposted video: check the original post's media
      const crossposts = p.crosspost_parent_list as Record<string, unknown>[] | undefined;
      const parentMedia = crossposts?.[0]?.media as Record<string, unknown> | undefined;
      const parentVideo = parentMedia?.reddit_video as Record<string, string> | undefined;
      if (parentVideo?.fallback_url) media.push(decodeHtmlEntities(parentVideo.fallback_url));
    }
  }

  // Thumbnail as last resort (skip 'self', 'default', 'nsfw' placeholders)
  const thumb = p.thumbnail as string | undefined;
  if (thumb && thumb.startsWith('http') && media.length === 0) {
    media.push(thumb);
  }

  return media;
}

/** Read a text value from an Atom XML element without adding an XML dependency. */
function atomText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ?? '';
}

/** Read an attribute from an Atom XML element such as <link href="..." />. */
function atomAttribute(block: string, tag: string, attribute: string): string {
  const element = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))?.[0] ?? '';
  const match = element.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return decodeHtmlEntities(match?.[1] ?? '');
}

/** Convert Reddit's HTML-encoded Atom content into readable post text. */
function cleanAtomContent(value: string): string {
  // Atom content is HTML-escaped once, and the embedded HTML may contain
  // another layer of entities (for example &amp;#39; for an apostrophe).
  const decoded = decodeHtmlEntities(decodeHtmlEntities(value));
  return decodeHtmlEntities(
    decoded
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

/** Parse Reddit's public Atom/RSS feed into the app's Post shape. */
interface RedditSourceInfo {
  key: string;
  label: string;
  slug: string;
  isUser: boolean;
}

function normalizeRedditSource(source: string): RedditSourceInfo {
  const trimmed = source.trim();
  const isUser = trimmed.toLowerCase().startsWith('u/');
  const slug = (isUser ? trimmed.replace(/^u\//i, '') : trimmed.replace(/^r\//i, '')).trim();
  const normalizedSlug = slug.toLowerCase();
  return {
    key: `reddit:${isUser ? 'user' : 'subreddit'}:${normalizedSlug}`,
    label: `${isUser ? 'u/' : 'r/'}${slug}`,
    slug,
    isUser,
  };
}

function parseRedditFeed(xml: string, source: RedditSourceInfo): Post[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

  return entries.flatMap((entry, index) => {
    const title = cleanAtomContent(atomText(entry, 'title'));
    const description = cleanAtomContent(atomText(entry, 'content'))
      .replace(/\s+submitted by\s+\/u\/\S+[\s\S]*$/i, '')
      .trim();
    const content = description && !/^\[?(link|comments)\]?$/i.test(description)
      ? description
      : title;
    const id = atomText(entry, 'id').trim().replace(/^t3_/, '') || `rss_${index}`;
    const authorName = cleanAtomContent(atomText(entry, 'name')).replace(/^\/u\//i, '').trim() || 'Reddit';
    const url = atomAttribute(entry, 'link', 'href');
    const timestamp = atomText(entry, 'published').trim() || atomText(entry, 'updated').trim();
    const media = [
      atomAttribute(entry, 'media:content', 'url'),
      atomAttribute(entry, 'media:thumbnail', 'url'),
      atomAttribute(entry, 'enclosure', 'url'),
    ].filter(urlValue => /^https?:\/\//i.test(urlValue));

    if (!title && !content) return [];

    return [{
      id: `reddit_${id}`,
      platform: 'reddit',
      author: authorName,
      authorHandle: `u/${authorName}`,
      content: content || title,
      timestamp: Number.isNaN(new Date(timestamp).getTime())
        ? new Date().toISOString()
        : new Date(timestamp).toISOString(),
      url: url || 'https://www.reddit.com',
      likes: undefined,
      comments: undefined,
      reposts: 0,
      media: media.length > 0 ? Array.from(new Set(media)) : undefined,
      sourceKey: source.key,
      sourceLabel: source.label,
      sourceKind: source.isUser ? 'user' : 'subreddit',
      isOfficial: !source.isUser && authorName.toLowerCase() === source.slug.toLowerCase(),
    }];
  });
}

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Reddit (public RSS feed, no auth needed) ──────────────────────────────
async function fetchRedditPosts(accounts: string[], credentials?: PlatformCredentials): Promise<Post[]> {
  // Reddit's RSS feed is the supported no-credential public route. Reddit now
  // frequently returns 403 to direct JSON requests, even with a User-Agent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native') as typeof import('react-native');
  if (Platform.OS === 'web') {
    throw new Error(
      'Reddit: open in Expo Go on your phone — Reddit blocks cross-origin requests from browsers.',
    );
  }

  if (credentials?.clientId && credentials.clientSecret && credentials.username && credentials.password) {
    return fetchRedditPostsOAuth(accounts, credentials);
  }

  const posts: Post[] = [];
  const errors: string[] = [];
  const sources = accounts.length > 0 ? accounts : [];
  let lastRssRequestAt = 0;

  for (const source of sources.slice(0, 5)) {
    try {
      const sourceInfo = normalizeRedditSource(source);
      const endpoint = sourceInfo.isUser
        ? `https://www.reddit.com/user/${encodeURIComponent(sourceInfo.slug)}/.rss?limit=10`
        : `https://www.reddit.com/r/${encodeURIComponent(sourceInfo.slug)}/.rss?limit=10`;

      // Reddit applies burst limits to public RSS too. Space requests so a
      // list of followed sources does not look like an automated scrape.
      const elapsed = Date.now() - lastRssRequestAt;
      if (lastRssRequestAt > 0 && elapsed < 2500) {
        await waitMs(2500 - elapsed);
      }

      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        lastRssRequestAt = Date.now();
        res = await fetch(endpoint, {
          headers: {
            Accept: 'application/atom+xml, application/xml, text/xml',
            'User-Agent': 'android:com.socialscraper.app:v1.0.0 (by /u/SocialScraperApp)',
          },
        });

        if (res.status !== 429 || attempt === 2) break;

        const retryAfter = Number(res.headers.get('Retry-After'));
        const retryDelay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 8000)
          : (attempt + 1) * 4000;
        await waitMs(retryDelay);
      }

      if (!res) {
        errors.push(`${sourceInfo.label}: request did not complete`);
        continue;
      }

      if (!res.ok) {
        errors.push(
          `${sourceInfo.label}: HTTP ${res.status}` +
          (res.status === 429 ? ' (Reddit rate limit; try refresh again in a moment)' : ''),
        );
        continue;
      }
      const feedPosts = parseRedditFeed(await res.text(), sourceInfo);
      posts.push(...feedPosts);
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    throw new Error('Reddit: ' + errors.join(' | '));
  }
  return posts;
}

async function fetchRedditPostsOAuth(
  accounts: string[],
  credentials: PlatformCredentials,
): Promise<Post[]> {
  const token = await getRedditToken(credentials);
  const posts: Post[] = [];
  const errors: string[] = [];
  const sources = accounts.length > 0 ? accounts : [];

  for (const source of sources.slice(0, 5)) {
    const sourceInfo = normalizeRedditSource(source);
    const endpoint = sourceInfo.isUser
      ? `https://oauth.reddit.com/user/${sourceInfo.slug}/submitted?limit=20&raw_json=1`
      : `https://oauth.reddit.com/r/${sourceInfo.slug}/hot?limit=20&raw_json=1`;

    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': `SocialScraper/1.0 by u/${credentials.username}`,
        },
      });
      if (!res.ok) {
        errors.push(`${sourceInfo.label}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const child of (data?.data?.children ?? []) as Array<{ data: Record<string, unknown> }>) {
        const p = child.data;
        const content = ((p.selftext as string) || (p.title as string)) ?? '';
        if (!content || content === '[deleted]' || content === '[removed]') continue;
        posts.push({
          id: `reddit_${p.id as string}`,
          platform: 'reddit',
          author: p.author as string,
          authorHandle: `u/${p.author as string}`,
          content,
          timestamp: new Date((p.created_utc as number) * 1000).toISOString(),
          url: `https://reddit.com${p.permalink as string}`,
          likes: p.ups as number,
          comments: p.num_comments as number,
          reposts: 0,
          media: extractRedditMedia(p),
          sourceKey: sourceInfo.key,
          sourceLabel: sourceInfo.label,
          sourceKind: sourceInfo.isUser ? 'user' : 'subreddit',
          isOfficial: !sourceInfo.isUser && String(p.author).toLowerCase() === sourceInfo.slug.toLowerCase(),
        });
      }
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    throw new Error('Reddit OAuth: ' + errors.join(' | '));
  }
  return posts;
}

// ─── X / Twitter (Bearer Token, v2 API) ──────────────────────────────────
async function fetchXPosts(accounts: string[], credentials: PlatformCredentials): Promise<Post[]> {
  if (!credentials.bearerToken) {
    throw new Error('X: Bearer Token is required. Add it in Settings → X.');
  }

  const posts: Post[] = [];
  const headers = { Authorization: `Bearer ${credentials.bearerToken}` };

  for (const account of accounts.slice(0, 3)) {
    const username = account.replace(/^@/, '').trim();
    try {
      const userRes = await fetch(
        `https://api.twitter.com/2/users/by/username/${username}?user.fields=name,username,profile_image_url`,
        { headers }
      );
      if (!userRes.ok) continue;
      const user = (await userRes.json())?.data;
      if (!user) continue;

      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${user.id}/tweets?max_results=10&tweet.fields=created_at,public_metrics,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type&exclude=retweets,replies`,
        { headers }
      );
      if (!tweetsRes.ok) continue;
      const tweetsData = await tweetsRes.json();
      const tweets: Record<string, unknown>[] = tweetsData?.data ?? [];
      const mediaMap: Record<string, string> = {};
      for (const m of (tweetsData?.includes?.media ?? []) as Record<string, unknown>[]) {
        const key = m.media_key as string;
        const url = (m.url ?? m.preview_image_url) as string | undefined;
        if (key && url) mediaMap[key] = url;
      }

      for (const t of tweets) {
        const m = t.public_metrics as Record<string, number> | undefined;
        const mediaKeys = (t.attachments as Record<string, string[]> | undefined)?.media_keys ?? [];
        const tweetMedia = mediaKeys.map((k: string) => mediaMap[k]).filter(Boolean);
        posts.push({
          id: `x_${t.id as string}`,
          platform: 'x',
          author: user.name as string,
          authorHandle: `@${user.username as string}`,
          authorAvatar: user.profile_image_url as string | undefined,
          content: t.text as string,
          timestamp: t.created_at as string,
          url: `https://x.com/${user.username as string}/status/${t.id as string}`,
          likes: m?.like_count,
          reposts: m?.retweet_count,
          comments: m?.reply_count,
          media: tweetMedia.length > 0 ? tweetMedia : undefined,
        });
      }
    } catch {
      // skip individual accounts that fail
    }
  }
  return posts;
}

// ─── Instagram (best-effort public profile API) ───────────────────────────
async function fetchInstagramPosts(accounts: string[], credentials: PlatformCredentials): Promise<Post[]> {
  const posts: Post[] = [];

  for (const account of accounts.slice(0, 2)) {
    const username = account.replace(/^@/, '').trim();
    try {
      const hdrs: Record<string, string> = { 'X-IG-App-ID': '936619743392459' };
      if (credentials.cookies) hdrs['Cookie'] = credentials.cookies;

      const res = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        { headers: hdrs }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const edges: unknown[] =
        data?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

      for (const edge of edges.slice(0, 12)) {
        const node = (edge as { node: Record<string, unknown> }).node;
        if (!node) continue;
        const caption =
          (node.edge_media_to_caption as { edges: { node: { text: string } }[] })
            ?.edges?.[0]?.node?.text ?? '';

        // Collect media: display_url is the full image, thumbnail_src is a smaller version
        const mediaPics: string[] = [];
        const displayUrl = node.display_url as string | undefined;
        if (displayUrl) mediaPics.push(displayUrl);
        else {
          const thumbSrc = node.thumbnail_src as string | undefined;
          if (thumbSrc) mediaPics.push(thumbSrc);
        }

        posts.push({
          id: `instagram_${node.id as string}`,
          platform: 'instagram',
          author: username,
          authorHandle: `@${username}`,
          content: caption || '[Photo]',
          timestamp: new Date((node.taken_at_timestamp as number) * 1000).toISOString(),
          url: `https://www.instagram.com/p/${node.shortcode as string}/`,
          likes: (node.edge_media_preview_like as { count: number } | undefined)?.count,
          comments: (node.edge_media_to_comment as { count: number } | undefined)?.count,
          reposts: 0,
          media: mediaPics.length > 0 ? mediaPics : undefined,
        });
      }
    } catch {
      // silently skip; fall through to mock
    }
  }
  return posts;
}

// ─── LinkedIn (cookie-based HTML scraping — best effort) ─────────────────
async function fetchLinkedInPosts(accounts: string[], credentials: PlatformCredentials): Promise<Post[]> {
  const posts: Post[] = [];
  if (!credentials.cookies) return posts;

  for (const account of accounts.slice(0, 2)) {
    const username = account.replace(/^@/, '').trim();
    try {
      const res = await fetch(`https://www.linkedin.com/in/${username}/recent-activity/shares/`, {
        headers: { Cookie: credentials.cookies, 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Extract JSON data blob from the page if available
      const match = html.match(/"text"\s*:\s*"([^"]{20,500})"/g);
      if (!match) continue;
      match.slice(0, 8).forEach((raw, i) => {
        const content = raw.replace(/^"text"\s*:\s*"/, '').replace(/"$/, '').replace(/\\n/g, '\n');
          const stableContentId = content.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72) || String(i);
        posts.push({
            id: `linkedin_${username}_${stableContentId}`,
          platform: 'linkedin',
          author: username,
          authorHandle: account,
          content,
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          url: `https://www.linkedin.com/in/${username}/`,
        });
      });
    } catch { /* skip */ }
  }
  return posts;
}

// ─── Facebook (cookie-based, best effort) ────────────────────────────────
async function fetchFacebookPosts(accounts: string[], credentials: PlatformCredentials): Promise<Post[]> {
  const posts: Post[] = [];
  if (!credentials.cookies) return posts;

  for (const account of accounts.slice(0, 2)) {
    const username = account.replace(/^@/, '').trim();
    try {
      const res = await fetch(`https://www.facebook.com/${username}`, {
        headers: { Cookie: credentials.cookies, 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const contentMatch = html.match(/"story"\s*:\s*\{[^}]*"message"\s*:\s*\{"text"\s*:\s*"([^"]{10,500})"/g);
      if (!contentMatch) continue;
      contentMatch.slice(0, 6).forEach((raw, i) => {
        const textMatch = raw.match(/"text"\s*:\s*"([^"]+)"/);
        if (!textMatch) return;
        const content = textMatch[1].replace(/\\n/g, '\n');
        const stableContentId = content.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72) || String(i);
        posts.push({
          id: `facebook_${username}_${stableContentId}`,
          platform: 'facebook',
          author: username,
          authorHandle: account,
          content,
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          url: `https://www.facebook.com/${username}`,
        });
      });
    } catch { /* skip */ }
  }
  return posts;
}

// ─── AI Rephrase ──────────────────────────────────────────────────────────
async function rephraseWithOpenAI(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const p = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${p.name} (max ${p.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
  });
  if (!res.ok) throw new Error('OpenAI API error: ' + res.status);
  return (await res.json()).choices[0].message.content.trim();
}

async function rephraseWithAnthropic(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const p = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${p.name} (max ${p.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Anthropic API error: ' + res.status);
  return (await res.json()).content[0].text.trim();
}

async function rephraseWithGemini(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const p = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${p.name} (max ${p.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  return (await res.json()).candidates[0].content.parts[0].text.trim();
}

// ─── Context ──────────────────────────────────────────────────────────────
interface AppContextType {
  settings: AppSettings;
  posts: Post[];
  composedPost: ComposedPost | null;
  isFetchingPosts: boolean;
  isRephrasing: boolean;
  lastFetchError: string | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updatePlatformSettings: (platform: PlatformId, patch: Partial<AppSettings['platforms'][PlatformId]>) => Promise<void>;
  fetchPosts: () => Promise<void>;
  postNow: (platform: PlatformId, content: string, redditTarget?: string) => Promise<PostResult>;
  startCompose: (post?: Post) => void;
  clearCompose: () => void;
  updateBaseContent: (content: string) => void;
  updatePlatformDraft: (platform: PlatformId, content: string) => void;
  toggleSelectedPlatform: (platform: PlatformId) => void;
  setSelectedPlatforms: (platforms: PlatformId[]) => void;
  rephrasePost: (platform: PlatformId, tone: AITone) => Promise<string>;
  applyRephrase: (content: string, platform?: PlatformId) => void;
  getEffectiveContent: (platform: PlatformId) => string;
  setComposedMedia: (urls: string[]) => void;
  addComposedMedia: (url: string) => void;
  removeComposedMedia: (index: number) => void;
  // Drafts
  drafts: Draft[];
  saveDraft: (scheduledAt?: string, redditTarget?: string) => Promise<string | undefined>;
  loadDraft: (draftId: string) => void;
  deleteDraft: (draftId: string) => Promise<void>;
  updateDraftSchedule: (draftId: string, scheduledAt: string | undefined) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [posts, setPosts] = useState<Post[]>([]);
  const [composedPost, setComposedPost] = useState<ComposedPost | null>(null);
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [isRephrasing, setIsRephrasing] = useState(false);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const composedPostRef = useRef(composedPost);
  composedPostRef.current = composedPost;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppSettings;
          setSettings(prev => {
            // Deep merge per-platform so new fields (e.g. useApi) keep their defaults
            const mergedPlatforms = Object.fromEntries(
              Object.entries(prev.platforms).map(([pid, defaults]) => [
                pid,
                { ...defaults, ...(parsed.platforms?.[pid as PlatformId] ?? {}) },
              ])
            ) as AppSettings['platforms'];
            const savedRedditSources = parsed.platforms?.reddit?.followedAccounts;
            const migratedRedditSources =
              Array.isArray(savedRedditSources) &&
              savedRedditSources.length === 3 &&
              ['programming', 'technology', 'worldnews'].every(source => savedRedditSources.includes(source))
                ? []
                : savedRedditSources;
            if (parsed.platforms?.reddit && migratedRedditSources) {
              mergedPlatforms.reddit = {
                ...mergedPlatforms.reddit,
                followedAccounts: migratedRedditSources,
              };
            }
            return { ...prev, ...parsed, platforms: mergedPlatforms };
          });
        }
        const postsRaw = await AsyncStorage.getItem(POSTS_KEY);
        if (postsRaw) {
          const saved: Post[] = JSON.parse(postsRaw);
          if (saved.length > 0) setPosts(saved.map(post => ({ ...post, isNew: false })));
        }
        const draftsRaw = await AsyncStorage.getItem(DRAFTS_KEY);
        if (draftsRaw) setDrafts(JSON.parse(draftsRaw));
      } catch { /* ignore hydration errors */ }
    })();
  }, []);

  const saveSettings = useCallback(async (next: AppSettings) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    await saveSettings(next);
  }, [saveSettings]);

  const updatePlatformSettings = useCallback(async (platform: PlatformId, patch: Partial<AppSettings['platforms'][PlatformId]>) => {
    const next: AppSettings = {
      ...settingsRef.current,
      platforms: {
        ...settingsRef.current.platforms,
        [platform]: { ...settingsRef.current.platforms[platform], ...patch },
      },
    };
    setSettings(next);
    await saveSettings(next);
  }, [saveSettings]);

  const fetchPosts = useCallback(async () => {
    setIsFetchingPosts(true);
    setLastFetchError(null);
    const s = settingsRef.current;
    const allPosts: Post[] = [];
    const fetchErrors: string[] = [];
    const addFetchedPosts = (items: Post[], platform: PlatformId) => {
      allPosts.push(...items.map(post => post.sourceKey ? post : {
        ...post,
        sourceKey: `${platform}:account:${post.authorHandle || post.author}`,
        sourceLabel: post.authorHandle || post.author,
        sourceKind: 'account' as const,
      }));
    };

    try {
      // ─── Bright Data platforms (Instagram, LinkedIn, TikTok, X, Facebook) ──
      const brightDataPlatforms: PlatformId[] = ['instagram', 'linkedin', 'tiktok', 'x', 'facebook'];
      const hasBrightDataSources = brightDataPlatforms.some(pid => {
        const ps = s.platforms[pid];
        return ps.fetchEnabled && ps.followedAccounts.length > 0;
      });

      if (hasBrightDataSources) {
        try {
          const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
          const res = await fetch(`${apiUrl}/brightdata/feed?userId=local-user`);
          if (res.ok) {
            const data = await res.json();
            const bdPosts: Post[] = (data.posts ?? []).map((p: any) => ({
              id: `${p.platform}_${p.platformPostId}`,
              platform: p.platform,
              author: p.username,
              authorHandle: `@${p.username}`,
              content: p.text,
              timestamp: p.publishedAt ?? new Date().toISOString(),
              url: p.url,
              likes: p.metrics?.likes,
              comments: p.metrics?.comments,
              reposts: p.metrics?.shares,
              media: p.media?.map((m: any) => m.url),
              mediaItems: p.media,
              sourceKey: `${p.platform}:account:${p.username}`,
              sourceLabel: `@${p.username}`,
              sourceKind: 'account' as const,
            }));
            addFetchedPosts(bdPosts, 'instagram'); // platform already set per-post
          } else {
            fetchErrors.push(`Bright Data: HTTP ${res.status}`);
          }
        } catch (e) {
          fetchErrors.push(`Bright Data: ${e instanceof Error ? e.message : 'fetch failed'}`);
        }
      }

      // ─── Reddit (Apify) ──────────────────────────────────────────────────
      for (const [pid, pSettings] of Object.entries(s.platforms)) {
        if (!pSettings.fetchEnabled) continue;
        const platform = pid as PlatformId;

        if (platform === 'reddit') {
          try {
            const monitorId = await AsyncStorage.getItem(REDDIT_MONITOR_ID_KEY);
            const creds = {
              clientId: pSettings.credentials.clientId,
              clientSecret: pSettings.credentials.clientSecret,
              username: pSettings.credentials.username,
              password: pSettings.credentials.password,
            };
            const result = await refreshRedditMonitor(pSettings.followedAccounts, monitorId ?? undefined, false, creds);
            addFetchedPosts(result.posts, platform);
          } catch (e) {
            fetchErrors.push(`Reddit: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      allPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (allPosts.length === 0) {
        if (postsRef.current.length > 0 && fetchErrors.length > 0) {
          // Keep prior real posts on transient failure
          setLastFetchError(fetchErrors.join('\n') + '\n\n⚠️ Showing your last successful fetch.');
        } else {
          if (postsRef.current.length === 0) {
            setPosts([]);
            await AsyncStorage.removeItem(POSTS_KEY);
          } else {
            const cleared = postsRef.current.map(post => ({ ...post, isNew: false }));
            setPosts(cleared);
            await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(cleared));
          }
          if (fetchErrors.length > 0) setLastFetchError(fetchErrors.join('\n'));
          else setLastFetchError('No posts returned. Configure platforms in Settings.');
        }
      } else {
        // Treat AsyncStorage as a local post database. Every successful fetch
        // clears the previous "new" markers, then only unseen IDs are marked.
        const previous = postsRef.current;
        const knownIds = new Set(previous.map(post => post.id));
        const merged = new Map<string, Post>(
          previous.map(post => [post.id, { ...post, isNew: false }]),
        );
        const fetchedAt = new Date().toISOString();
        const fetchBatchId = `fetch_${Date.now()}`;
        for (const post of allPosts) {
          merged.set(post.id, {
            ...post,
            isNew: !knownIds.has(post.id),
            fetchedAt,
            fetchBatchId,
          });
        }
        const nextPosts = Array.from(merged.values()).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setPosts(nextPosts);
        await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(nextPosts));
        if (fetchErrors.length > 0) setLastFetchError(fetchErrors.join('\n'));
      }
    } catch (e: unknown) {
      setLastFetchError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsFetchingPosts(false);
    }
  }, []);

  const postNow = useCallback(async (
    platform: PlatformId,
    content: string,
    redditTarget?: string,
  ): Promise<PostResult> => {
    const platformSettings = settingsRef.current.platforms[platform];
    const poster = PLATFORM_POSTERS[platform];
    if (!poster) return { ok: false, error: `${PLATFORMS[platform].name} API posting is not available.` };
    if (!platformSettings?.postEnabled) {
      return { ok: false, error: `Enable posting for ${PLATFORMS[platform].name} in Settings first.` };
    }
    if (!hasPostingCredentials(platform, platformSettings.credentials)) {
      return { ok: false, error: `Add ${PLATFORMS[platform].name} API credentials in Settings first.` };
    }
    const extra = platform === 'reddit' && redditTarget ? { subreddit: redditTarget } : undefined;
    return poster(content, platformSettings.credentials, extra);
  }, []);

  useEffect(() => {
    const intervals: Record<AppSettings['fetchFrequency'], number | undefined> = {
      manual: undefined,
      '15min': 15 * 60 * 1000,
      '30min': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
    };
    const interval = intervals[settings.fetchFrequency];
    if (!interval) return;
    const timer = setInterval(() => {
      void fetchPosts();
    }, interval);
    return () => clearInterval(timer);
  }, [fetchPosts, settings.fetchFrequency]);

  const startCompose = useCallback((post?: Post) => {
    setComposedPost({
      id: generateId(),
      originalPost: post,
      baseContent: post?.content ?? '',
      drafts: {},
      selectedPlatforms: [],
      aiRephrased: false,
      media: post?.media ? [...post.media] : [],
    });
  }, []);

  const clearCompose = useCallback(() => setComposedPost(null), []);
  const updateBaseContent = useCallback((content: string) => {
    setComposedPost(prev => prev ? { ...prev, baseContent: content } : null);
  }, []);
  const updatePlatformDraft = useCallback((platform: PlatformId, content: string) => {
    setComposedPost(prev => {
      if (!prev) return null;
      return { ...prev, drafts: { ...prev.drafts, [platform]: { content, edited: true } } };
    });
  }, []);
  const toggleSelectedPlatform = useCallback((platform: PlatformId) => {
    setComposedPost(prev => {
      if (!prev) return null;
      const has = prev.selectedPlatforms.includes(platform);
      return {
        ...prev,
        selectedPlatforms: has
          ? prev.selectedPlatforms.filter(p => p !== platform)
          : [...prev.selectedPlatforms, platform],
      };
    });
  }, []);
  const setSelectedPlatforms = useCallback((platforms: PlatformId[]) => {
    setComposedPost(prev => prev ? { ...prev, selectedPlatforms: platforms } : null);
  }, []);

  // ─── Scheduler ────────────────────────────────────────────────────────────
  const postToPlatformViaBackend = useCallback(async (pid: string, content: string, subreddit?: string) => {
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api'}/post/${pid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, userId: 'local-user', subreddit }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Failed to post to ${pid}`);
      }
      return await res.json() as { ok: boolean; url?: string };
    } catch (error) {
      throw error;
    }
  }, []);

  const executeScheduledDraft = useCallback(async (draft: Draft) => {
    const s = settingsRef.current;
    const results: Draft['postResults'] = {};

    for (const pid of draft.composedPost.selectedPlatforms) {
      const pSettings = s.platforms[pid as PlatformId];
      if (!pSettings?.postEnabled) continue;
      if (!hasPostingCredentials(pid as PlatformId, pSettings.credentials)) continue;

      const content = draft.composedPost.drafts[pid as PlatformId]?.edited
        ? draft.composedPost.drafts[pid as PlatformId]!.content
        : draft.composedPost.baseContent;

      const extra = pid === 'reddit' && draft.redditTarget ? { subreddit: draft.redditTarget } : undefined;

      try {
        // Try backend API first (uses stored OAuth tokens)
        const result = await postToPlatformViaBackend(pid, content, extra?.subreddit);
        results[pid] = { ok: result.ok, url: result.url };
      } catch (error) {
        // Fall back to frontend poster (uses manual credentials)
        const poster = PLATFORM_POSTERS[pid as PlatformId];
        if (poster) {
          results[pid] = await poster(content, pSettings.credentials, extra);
        } else {
          results[pid] = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    }

    // Update draft with results then remove it
    const next = draftsRef.current.filter(d => d.id !== draft.id);
    setDrafts(next);
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(next));

    // Alert summary
    const lines = Object.entries(results).map(([pid, r]) =>
      r.ok ? `✓ ${pid}${r.url ? ` — ${r.url}` : ''}` : `✗ ${pid}: ${r.error}`
    );
    const skipped = draft.composedPost.selectedPlatforms.filter(pid => !results[pid]);
    if (skipped.length) lines.push(`⚠ Skipped (no credentials): ${skipped.join(', ')}`);

    Alert.alert(
      lines.every(l => l.startsWith('✓')) ? '🚀 Scheduled post published!' : '⚠ Scheduled post — partial',
      lines.join('\n'),
    );
  }, []);

  // Check scheduled drafts every 30 s while app is open
  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      const due = draftsRef.current.filter(
        d => d.scheduledAt && new Date(d.scheduledAt).getTime() <= now,
      );
      for (const draft of due) {
        await executeScheduledDraft(draft);
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [executeScheduledDraft]);

  // ─── Drafts ───────────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (scheduledAt?: string, redditTarget?: string): Promise<string | undefined> => {
    const cp = composedPostRef.current;
    if (!cp || !cp.baseContent.trim()) return undefined;
    const draft: Draft = {
      id: generateId(),
      composedPost: { ...cp },
      savedAt: new Date().toISOString(),
      scheduledAt,
      redditTarget,
    };
    const next = [draft, ...draftsRef.current];
    setDrafts(next);
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    return draft.id;
  }, []);

  const loadDraft = useCallback((draftId: string) => {
    const draft = draftsRef.current.find(d => d.id === draftId);
    if (draft) setComposedPost({ ...draft.composedPost });
  }, []);

  const deleteDraft = useCallback(async (draftId: string) => {
    const next = draftsRef.current.filter(d => d.id !== draftId);
    setDrafts(next);
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  }, []);

  const updateDraftSchedule = useCallback(async (draftId: string, scheduledAt: string | undefined) => {
    const next = draftsRef.current.map(d =>
      d.id === draftId ? { ...d, scheduledAt } : d
    );
    setDrafts(next);
    await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  }, []);

  const setComposedMedia = useCallback((urls: string[]) => {
    setComposedPost(prev => prev ? { ...prev, media: urls } : null);
  }, []);
  const addComposedMedia = useCallback((url: string) => {
    setComposedPost(prev => prev ? { ...prev, media: [...(prev.media ?? []), url] } : null);
  }, []);
  const removeComposedMedia = useCallback((index: number) => {
    setComposedPost(prev => {
      if (!prev) return null;
      const next = [...(prev.media ?? [])];
      next.splice(index, 1);
      return { ...prev, media: next };
    });
  }, []);

  const rephrasePost = useCallback(async (platform: PlatformId, tone: AITone): Promise<string> => {
    const s = settingsRef.current;
    if (!s.ai.apiKey) throw new Error('No AI API key configured. Go to Settings → AI Model.');
    const currentPost = composedPost;
    if (!currentPost) throw new Error('No post to rephrase');
    setIsRephrasing(true);
    try {
      const content = currentPost.drafts[platform]?.content ?? currentPost.baseContent;
      if (s.ai.provider === 'openai') return await rephraseWithOpenAI(content, platform, tone, s.ai);
      if (s.ai.provider === 'anthropic') return await rephraseWithAnthropic(content, platform, tone, s.ai);
      return await rephraseWithGemini(content, platform, tone, s.ai);
    } finally {
      setIsRephrasing(false);
    }
  }, [composedPost]);

  const applyRephrase = useCallback((content: string, platform?: PlatformId) => {
    if (platform) updatePlatformDraft(platform, content);
    else updateBaseContent(content);
    setComposedPost(prev => prev ? { ...prev, aiRephrased: true } : null);
  }, [updatePlatformDraft, updateBaseContent]);

  const getEffectiveContent = useCallback((platform: PlatformId): string => {
    if (!composedPost) return '';
    const draft = composedPost.drafts[platform];
    return draft?.edited ? draft.content : composedPost.baseContent;
  }, [composedPost]);

  return (
    <AppContext.Provider value={{
      settings, posts, composedPost, isFetchingPosts, isRephrasing, lastFetchError,
      updateSettings, updatePlatformSettings, fetchPosts, postNow,
      startCompose, clearCompose, updateBaseContent, updatePlatformDraft,
      toggleSelectedPlatform, setSelectedPlatforms,
      rephrasePost, applyRephrase, getEffectiveContent,
      setComposedMedia, addComposedMedia, removeComposedMedia,
      drafts, saveDraft, loadDraft, deleteDraft, updateDraftSchedule,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
