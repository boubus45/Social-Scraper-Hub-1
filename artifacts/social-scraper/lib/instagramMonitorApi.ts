import { PlatformId, Post } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL
  ?? 'https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api'
).replace(/\/+$/, '').replace(/\/api$/, '');
const MONITOR_ID_KEY = '@socialscraper/instagram-monitor-id';

interface InstagramMonitorPost {
  platform: 'instagram';
  account: { username: string; displayName?: string; id?: string };
  post: {
    id: string;
    url: string;
    text: string;
    publishedAt?: string;
    media: Array<{ type: 'image' | 'video'; url: string }>;
  };
  metrics: { likes: number; comments: number; shares: number; views: number };
}

interface MonitorResponse {
  monitor: { id: string };
}

function requireApiUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('The Social Scraper backend URL is not configured in this app build.');
  }
  return API_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend request failed (${response.status})${body ? `: ${body}` : ''}`);
  }
  return response.json() as Promise<T>;
}

function toAppPost(record: InstagramMonitorPost): Post {
  const username = record.account.username;
  return {
    id: `instagram_${record.post.id}`,
    platform: 'instagram' as PlatformId,
    author: record.account.displayName || username,
    authorHandle: `@${username}`,
    content: record.post.text,
    timestamp: record.post.publishedAt ?? new Date().toISOString(),
    url: record.post.url,
    likes: record.metrics.likes,
    comments: record.metrics.comments,
    media: record.post.media.map(item => item.url),
    sourceKey: `instagram:account:${username}`,
    sourceLabel: `@${username}`,
    sourceKind: 'account',
  };
}

export async function refreshInstagramMonitor(
  accounts: string[],
  existingMonitorId?: string,
): Promise<{ monitorId: string; posts: Post[] }> {
  const normalizedAccounts = [...new Set(accounts
    .map(account => account.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean))];
  if (normalizedAccounts.length === 0) {
    throw new Error('Add at least one Instagram account before refreshing.');
  }

  const payload = {
    userId: 'local-user',
    plan: 'free',
    accounts: normalizedAccounts,
    frequency: 'daily',
    enabled: true,
  };
  let monitor: MonitorResponse;
  if (existingMonitorId) {
    try {
      monitor = await request<MonitorResponse>(
        `/api/monitors/instagram/${encodeURIComponent(existingMonitorId)}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('(404)')) throw error;
      monitor = await request<MonitorResponse>('/api/monitors/instagram', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
  } else {
    monitor = await request<MonitorResponse>('/api/monitors/instagram', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  await AsyncStorage.setItem(MONITOR_ID_KEY, monitor.monitor.id);
  const result = await request<{ posts: InstagramMonitorPost[] }>(
    `/api/monitors/instagram/${encodeURIComponent(monitor.monitor.id)}/run`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return { monitorId: monitor.monitor.id, posts: result.posts.map(toAppPost) };
}

export { MONITOR_ID_KEY };
