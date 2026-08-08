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
import { PLATFORM_POSTERS, hasPostingCredentials, getRedditToken } from '@/lib/platformPosters';
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
async function fetchRedditPosts(accounts: string[], credentials?: PlatformCredentials): Promise<Post[]> {
  // Reddit's API works from mobile devices; on web the browser's CORS policy blocks it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native') as typeof import('react-native');
  if (Platform.OS === 'web') {
    throw new Error(
      'Reddit: open in Expo Go on your phone — Reddit blocks cross-origin requests from browsers.',
    );
  }

  // If OAuth credentials are provided, use authenticated API (works from cloud IPs)
  const hasOAuth = credentials && credentials.clientId && credentials.clientSecret && credentials.username && credentials.password;
  if (hasOAuth) {
    return fetchRedditPostsOAuth(accounts, credentials);
  }

  // Fallback: public JSON API (blocked from cloud/datacenter IPs)
  const posts: Post[] = [];
  const errors: string[] = [];
  const sources = accounts.length > 0 ? accounts : ['programming'];

  for (const source of sources.slice(0, 5)) {
    try {
      const trimmed = source.trim();
      const isUser = trimmed.startsWith('u/');
      const slug = isUser
        ? trimmed.replace(/^u\//, '').trim()
        : trimmed.replace(/^r\//, '').trim();
      const endpoint = isUser
        ? `https://www.reddit.com/user/${slug}/submitted.json?limit=20&raw_json=1`
        : `https://www.reddit.com/r/${slug}/hot.json?limit=20&raw_json=1`;

      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
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

/** Fetch Reddit posts via OAuth API (works from cloud IPs). */
async function fetchRedditPostsOAuth(accounts: string[], credentials: PlatformCredentials): Promise<Post[]> {
  const token = await getRedditToken(credentials);
  const posts: Post[] = [];
  const errors: string[] = [];
  const sources = accounts.length > 0 ? accounts : ['programming'];

  for (const source of sources.slice(0, 5)) {
    try {
      const trimmed = source.trim();
      const isUser = trimmed.startsWith('u/');
      const slug = isUser
        ? trimmed.replace(/^u\//, '').trim()
        : trimmed.replace(/^r\//, '').trim();
      const endpoint = isUser
        ? `https://oauth.reddit.com/user/${slug}/submitted?limit=20&raw_json=1`
        : `https://oauth.reddit.com/r/${slug}/hot?limit=20&raw_json=1`;

      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': `SocialScraper/1.0 by u/${credentials.username}`,
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
    throw new Error('Reddit OAuth: ' + errors.join(' | '));
  }
  return posts;
}


