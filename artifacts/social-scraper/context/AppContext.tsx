import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AITone,
  AppSettings,
  ComposedPost,
  PlatformCredentials,
  PlatformId,
  Post,
} from '@/types';
import { PLATFORMS } from '@/constants/platforms';

const STORAGE_KEY = '@socialscraper/settings';
const POSTS_KEY = '@socialscraper/posts';

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
      const isUser = source.startsWith('u/');
      const slug = isUser ? source.replace('u/', '').trim() : source.trim();
      const endpoint = isUser
        ? `https://www.reddit.com/user/${slug}/submitted.json?limit=20&raw_json=1`
        : `https://www.reddit.com/r/${slug}/hot.json?limit=20&raw_json=1`;

      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
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
        posts.push({
          id: `reddit_${p.id as string}`,
          platform: 'reddit',
          author: p.author as string,
          authorHandle: `u/${p.author as string}`,
          content: ((p.selftext as string) || (p.title as string)) ?? '',
          timestamp: new Date((p.created_utc as number) * 1000).toISOString(),
          url: `https://reddit.com${p.permalink as string}`,
          likes: p.ups as number,
          comments: p.num_comments as number,
          reposts: 0,
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
        `https://api.twitter.com/2/users/${user.id}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
        { headers }
      );
      if (!tweetsRes.ok) continue;
      const tweets: Record<string, unknown>[] = (await tweetsRes.json())?.data ?? [];

      for (const t of tweets) {
        const m = t.public_metrics as Record<string, number> | undefined;
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
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [posts, setPosts] = useState<Post[]>([]);
  const [composedPost, setComposedPost] = useState<ComposedPost | null>(null);
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [isRephrasing, setIsRephrasing] = useState(false);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
        if (postsRaw) setPosts(JSON.parse(postsRaw));
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

        // Manual mode: skip HTTP fetch
        if (!pSettings.useApi && (platform === 'x' || platform === 'reddit')) continue;

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
      setPosts(allPosts);
      await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(allPosts));
      if (fetchErrors.length > 0) setLastFetchError(fetchErrors.join('\n'));
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
