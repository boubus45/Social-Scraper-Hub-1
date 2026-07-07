import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AITone,
  AppSettings,
  ComposedPost,
  FetchFrequency,
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
    x: { fetchEnabled: false, postEnabled: false, credentials: {}, followedAccounts: [] },
    reddit: { fetchEnabled: true, postEnabled: false, credentials: {}, followedAccounts: ['programming', 'technology', 'worldnews'] },
    linkedin: { fetchEnabled: false, postEnabled: false, credentials: {}, followedAccounts: [] },
    facebook: { fetchEnabled: false, postEnabled: false, credentials: {}, followedAccounts: [] },
    instagram: { fetchEnabled: false, postEnabled: false, credentials: {}, followedAccounts: [] },
  },
  fetchFrequency: 'manual',
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Reddit public JSON API (no auth needed for public subreddits/users)
async function fetchRedditPosts(accounts: string[], credentials: AppSettings['platforms']['reddit']['credentials']): Promise<Post[]> {
  const posts: Post[] = [];
  const sources = accounts.length > 0 ? accounts : ['programming'];

  for (const source of sources.slice(0, 3)) {
    try {
      const isUser = source.startsWith('u/');
      const endpoint = isUser
        ? `https://www.reddit.com/user/${source.replace('u/', '')}/submitted.json?limit=10`
        : `https://www.reddit.com/r/${source}/new.json?limit=10`;

      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'SocialScraper/1.0' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const children = data?.data?.children ?? [];

      for (const child of children) {
        const p = child.data;
        if (!p || p.is_video) continue;
        posts.push({
          id: `reddit_${p.id}`,
          platform: 'reddit',
          author: p.author,
          authorHandle: `u/${p.author}`,
          content: p.selftext || p.title,
          timestamp: new Date(p.created_utc * 1000).toISOString(),
          url: `https://reddit.com${p.permalink}`,
          likes: p.ups,
          comments: p.num_comments,
          reposts: 0,
        });
      }
    } catch {
      // Skip failed sources
    }
  }
  return posts;
}

// Mock posts for platforms we can't easily scrape
function getMockPosts(platform: PlatformId, accounts: string[]): Post[] {
  const now = new Date();
  const mock = accounts.slice(0, 2).map((account, i) => ({
    id: `${platform}_mock_${i}_${Date.now()}`,
    platform,
    author: account,
    authorHandle: `@${account}`,
    content: `This is a sample post from ${account} on ${PLATFORMS[platform].name}. Configure your credentials in Settings → ${PLATFORMS[platform].name} to fetch real posts from followed accounts.`,
    timestamp: new Date(now.getTime() - i * 3600000).toISOString(),
    url: PLATFORMS[platform].webUrl ?? '',
    likes: Math.floor(Math.random() * 1000),
    reposts: Math.floor(Math.random() * 200),
    comments: Math.floor(Math.random() * 100),
  }));
  return mock;
}

async function rephraseWithOpenAI(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const platformDef = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${platformDef.name} (max ${platformDef.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error('OpenAI API error: ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function rephraseWithAnthropic(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const platformDef = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${platformDef.name} (max ${platformDef.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic API error: ' + res.status);
  const data = await res.json();
  return data.content[0].text.trim();
}

async function rephraseWithGemini(content: string, platform: PlatformId, tone: AITone, settings: AppSettings['ai']): Promise<string> {
  const toneMap: Record<AITone, string> = {
    professional: 'in a professional, authoritative tone',
    casual: 'in a casual, friendly tone',
    concise: 'as concisely as possible',
    expanded: 'with more detail and context',
    engaging: 'in a highly engaging, hook-driven style',
  };
  const platformDef = PLATFORMS[platform];
  const prompt = `Rephrase the following content for ${platformDef.name} (max ${platformDef.charLimit} characters) ${toneMap[tone]}. Return only the rephrased text, no quotes.\n\nContent:\n${content}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

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
          setSettings(prev => ({
            ...prev,
            ...parsed,
            platforms: { ...prev.platforms, ...parsed.platforms },
          }));
        }
        const postsRaw = await AsyncStorage.getItem(POSTS_KEY);
        if (postsRaw) setPosts(JSON.parse(postsRaw));
      } catch {}
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

    try {
      for (const [pid, pSettings] of Object.entries(s.platforms)) {
        if (!pSettings.fetchEnabled) continue;
        const platform = pid as PlatformId;

        if (platform === 'reddit') {
          const redditPosts = await fetchRedditPosts(pSettings.followedAccounts, pSettings.credentials);
          allPosts.push(...redditPosts);
        } else if (pSettings.followedAccounts.length > 0) {
          allPosts.push(...getMockPosts(platform, pSettings.followedAccounts));
        }
      }

      allPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setPosts(allPosts);
      await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(allPosts));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setLastFetchError(message);
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
      return {
        ...prev,
        drafts: {
          ...prev.drafts,
          [platform]: { content, edited: true },
        },
      };
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
      let result: string;
      if (s.ai.provider === 'openai') result = await rephraseWithOpenAI(content, platform, tone, s.ai);
      else if (s.ai.provider === 'anthropic') result = await rephraseWithAnthropic(content, platform, tone, s.ai);
      else result = await rephraseWithGemini(content, platform, tone, s.ai);
      return result;
    } finally {
      setIsRephrasing(false);
    }
  }, [composedPost]);

  const applyRephrase = useCallback((content: string, platform?: PlatformId) => {
    if (platform) {
      updatePlatformDraft(platform, content);
    } else {
      updateBaseContent(content);
    }
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
