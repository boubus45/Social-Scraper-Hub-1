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
import { PLATFORM_POSTERS, hasPostingCredentials } from '@/lib/platformPosters';
import { PLATFORMS } from '@/constants/platforms';

const STORAGE_KEY = '@socialscraper/settings';
const POSTS_KEY = '@socialscraper/posts';
const DRAFTS_KEY = '@socialscraper/drafts';

const defaultSettings: AppSettings = {
  profile: { name: '', handle: '', bio: '' },
  ai: { provider: 'openai', model: 'gpt-4o-mini', apiKey: '' },
  platforms: {
    x: { fetchEnabled: false, postEnabled: false, useApi: false, credentials: {}, followedAccounts: [] },
    reddit: { fetchEnabled: true, postEnabled: false, useApi: true, credentials: {}, followedAccounts: ['programming', 'technology', 'worldnews'] },
    linkedin: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    facebook: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
    instagram: { fetchEnabled: false, postEnabled: false, useApi: true, credentials: {}, followedAccounts: [] },
  },
  fetchFrequency: 'manual',
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/** Decode HTML entities that Reddit encodes in preview URLs (e.g. &amp; → &) */
function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
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

// ─── Demo posts (shown when all API fetches yield nothing) ────────────────
function getDemoPosts(): Post[] {
  const now = Date.now();
  return [
    {
      id: 'demo_reddit_1',
      platform: 'reddit',
      author: 'GadgetEnthusiast',
      authorHandle: 'u/GadgetEnthusiast',
      content: '🚀 Just tested the new M4 MacBook Pro battery life — 18+ hours of real-world coding. Not Apple\'s synthetic benchmarks, actual work. Anyone else made the switch from the M2?',
      timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      url: 'https://reddit.com/r/apple',
      likes: 4821,
      comments: 312,
      reposts: 0,
      media: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=80'],
    },
    {
      id: 'demo_reddit_2',
      platform: 'reddit',
      author: 'devmindset',
      authorHandle: 'u/devmindset',
      content: 'Hot take: TypeScript strict mode should be enabled by default in every new project. The extra setup time pays for itself in the first week. Fight me.',
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      url: 'https://reddit.com/r/programming',
      likes: 2340,
      comments: 189,
      reposts: 0,
    },
    {
      id: 'demo_reddit_3',
      platform: 'reddit',
      author: 'AIWatcherPro',
      authorHandle: 'u/AIWatcherPro',
      content: 'OpenAI just dropped o3-mini and the benchmarks are wild — passing PhD-level math problems at ~$1 per task. We\'re entering the era of "$1 expert consultants". Thread 🧵',
      timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      url: 'https://reddit.com/r/technology',
      likes: 9102,
      comments: 741,
      reposts: 0,
      media: ['https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80'],
    },
    {
      id: 'demo_x_1',
      platform: 'x',
      author: 'Product Hunt',
      authorHandle: '@ProductHunt',
      content: '🎉 Today\'s #1 product: SocialScraper — aggregate posts from all your social feeds, rephrase with AI, and cross-post in one tap. Built by indie devs, for indie devs.',
      timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      url: 'https://x.com/producthunt',
      likes: 1203,
      reposts: 341,
      comments: 67,
    },
    {
      id: 'demo_reddit_4',
      platform: 'reddit',
      author: 'SpaceNerd42',
      authorHandle: 'u/SpaceNerd42',
      content: 'Starship\'s 8th test flight successfully completed the full trajectory and ocean splashdown. Reusability target met. The economics of space access are about to change fundamentally.',
      timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      url: 'https://reddit.com/r/space',
      likes: 31_500,
      comments: 2840,
      reposts: 0,
      media: ['https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=600&q=80'],
    },
    {
      id: 'demo_instagram_1',
      platform: 'instagram',
      author: 'DesignInspiration',
      authorHandle: '@designinspiration',
      content: 'Clean UI, clean mind. ✨ This minimal dashboard redesign we shipped this week cut user onboarding time by 40%. Sometimes less really is more. #uxdesign #productdesign #ui',
      timestamp: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      url: 'https://instagram.com/designinspiration',
      likes: 8741,
      comments: 213,
      reposts: 0,
      media: ['https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?w=600&q=80'],
    },
  ];
}

// ─── Reddit (public JSON API, no auth needed) ─────────────────────────────
async function fetchRedditPosts(accounts: string[]): Promise<Post[]> {
  // Reddit's API works from mobile devices; on web the browser's CORS policy blocks it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native') as typeof import('react-native');
  if (Platform.OS === 'web') {
    throw new Error(
      'Reddit: open in Expo Go on your phone — Reddit blocks cross-origin requests from browsers.',
    );
  }

  const posts: Post[] = [];
  const errors: string[] = [];
  const sources = accounts.length > 0 ? accounts : ['programming'];

  for (const source of sources.slice(0, 5)) {
    try {
      const trimmed = source.trim();
      const isUser = trimmed.startsWith('u/');
      // Strip leading r/ or u/ prefix so users can type either "unsloth" or "r/unsloth"
      const slug = isUser
        ? trimmed.replace(/^u\//, '').trim()
        : trimmed.replace(/^r\//, '').trim();
      const endpoint = isUser
        ? `https://www.reddit.com/user/${slug}/submitted.json?limit=20&raw_json=1`
        : `https://www.reddit.com/r/${slug}/hot.json?limit=20&raw_json=1`;

      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          // Reddit blocks requests without a descriptive UA (returns 403/429).
          // Format required by Reddit API rules: platform:appId:version (by /u/user)
          'User-Agent': 'android:com.socialscraper.app:v1.0.0 (by /u/SocialScraperApp)',
        },
      });

      if (!res.ok) {
        errors.push(`${isUser ? 'u/' : 'r/'}${slug}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const children: unknown[] = data?.data?.children ?? [];

      for (const child of children) {
        const p = (child as { data: Record<string, unknown> }).data;
        if (!p) continue;

        const content = ((p.selftext as string) || (p.title as string)) ?? '';
        // Skip empty/deleted posts
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
        });
      }
    } catch (err) {
      errors.push(`${source}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (posts.length === 0 && errors.length > 0) {
    throw new Error('Reddit: ' + errors.join(' | '));
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
        posts.push({
          id: `linkedin_${username}_${i}_${Date.now()}`,
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
        posts.push({
          id: `facebook_${username}_${i}_${Date.now()}`,
          platform: 'facebook',
          author: username,
          authorHandle: account,
          content: textMatch[1].replace(/\\n/g, '\n'),
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          url: `https://www.facebook.com/${username}`,
        });
      });
    } catch { /* skip */ }
  }
  return posts;
}

// ─── Mock posts fallback ──────────────────────────────────────────────────
function getMockPosts(platform: PlatformId, accounts: string[]): Post[] {
  const now = new Date();
  return accounts.slice(0, 2).map((account, i) => ({
    id: `${platform}_mock_${i}_${Date.now()}`,
    platform,
    author: account,
    authorHandle: `@${account}`,
    content: `Configure credentials for ${PLATFORMS[platform].name} in Settings to fetch real posts.`,
    timestamp: new Date(now.getTime() - i * 3600000).toISOString(),
    url: PLATFORMS[platform].webUrl ?? '',
    likes: 0,
    reposts: 0,
    comments: 0,
  }));
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
            return { ...prev, ...parsed, platforms: mergedPlatforms };
          });
        }
        const postsRaw = await AsyncStorage.getItem(POSTS_KEY);
        if (postsRaw) {
          const saved: Post[] = JSON.parse(postsRaw);
          if (saved.length > 0) setPosts(saved);
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

    try {
      for (const [pid, pSettings] of Object.entries(s.platforms)) {
        if (!pSettings.fetchEnabled) continue;
        const platform = pid as PlatformId;

        // Manual mode: skip HTTP fetch for X only (Reddit's public JSON needs no credentials)
        if (pSettings.useApi === false && platform === 'x') continue;

        if (platform === 'reddit') {
          try {
            const p = await fetchRedditPosts(pSettings.followedAccounts);
            allPosts.push(...p);
          } catch (e) {
            fetchErrors.push(e instanceof Error ? e.message : String(e));
          }
        } else if (platform === 'x') {
          try {
            const p = await fetchXPosts(pSettings.followedAccounts, pSettings.credentials);
            allPosts.push(...p);
          } catch (e) {
            fetchErrors.push(e instanceof Error ? e.message : String(e));
          }
        } else if (platform === 'instagram') {
          if (pSettings.followedAccounts.length > 0) {
            try {
              const p = await fetchInstagramPosts(pSettings.followedAccounts, pSettings.credentials);
              if (p.length > 0) {
                allPosts.push(...p);
              } else if (pSettings.credentials.cookies) {
                fetchErrors.push('Instagram: could not parse posts (cookies may be expired)');
              } else {
                allPosts.push(...getMockPosts(platform, pSettings.followedAccounts));
              }
            } catch {
              allPosts.push(...getMockPosts(platform, pSettings.followedAccounts));
            }
          }
        } else if (platform === 'linkedin') {
          if (pSettings.followedAccounts.length > 0) {
            try {
              const p = await fetchLinkedInPosts(pSettings.followedAccounts, pSettings.credentials);
              allPosts.push(...(p.length > 0 ? p : getMockPosts(platform, pSettings.followedAccounts)));
            } catch {
              allPosts.push(...getMockPosts(platform, pSettings.followedAccounts));
            }
          }
        } else if (platform === 'facebook') {
          if (pSettings.followedAccounts.length > 0) {
            try {
              const p = await fetchFacebookPosts(pSettings.followedAccounts, pSettings.credentials);
              allPosts.push(...(p.length > 0 ? p : getMockPosts(platform, pSettings.followedAccounts)));
            } catch {
              allPosts.push(...getMockPosts(platform, pSettings.followedAccounts));
            }
          }
        }
      }

      allPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (allPosts.length === 0) {
        if (postsRef.current.length > 0 && fetchErrors.length > 0) {
          // Keep prior real posts on transient failure
          setLastFetchError(fetchErrors.join('\n') + '\n\n⚠️ Showing your last successful fetch.');
        } else {
          setPosts([]);
          await AsyncStorage.removeItem(POSTS_KEY);
          if (fetchErrors.length > 0) setLastFetchError(fetchErrors.join('\n'));
          else setLastFetchError('No posts returned. Configure platforms in Settings.');
        }
      } else {
        setPosts(allPosts);
        await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(allPosts));
        if (fetchErrors.length > 0) setLastFetchError(fetchErrors.join('\n'));
      }
    } catch (e: unknown) {
      setLastFetchError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsFetchingPosts(false);
    }
  }, []);

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
  const executeScheduledDraft = useCallback(async (draft: Draft) => {
    const s = settingsRef.current;
    const results: Draft['postResults'] = {};

    for (const pid of draft.composedPost.selectedPlatforms) {
      const pSettings = s.platforms[pid];
      if (!pSettings?.postEnabled) continue;
      if (!hasPostingCredentials(pid, pSettings.credentials)) continue;

      const poster = PLATFORM_POSTERS[pid];
      if (!poster) continue;

      const content = draft.composedPost.drafts[pid]?.edited
        ? draft.composedPost.drafts[pid]!.content
        : draft.composedPost.baseContent;

      const extra = pid === 'reddit' && draft.redditTarget ? { subreddit: draft.redditTarget } : undefined;
      results[pid] = await poster(content, pSettings.credentials, extra);
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
      updateSettings, updatePlatformSettings, fetchPosts,
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
