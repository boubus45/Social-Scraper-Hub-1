import AsyncStorage from "@react-native-async-storage/async-storage";
import { Post, PlatformId } from "@/types";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL
  ?? "https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api"
).replace(/\/+$/, "").replace(/\/api$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error;
    } catch {}
    throw new Error(`Backend request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.json() as Promise<T>;
}

interface NormalizedPost {
  id: string;
  url: string;
  text: string;
  publishedAt?: string;
  media: Array<{ type: string; url: string }>;
  metrics: { likes?: number; comments?: number; shares?: number; views?: number };
}

interface NormalizedProfile {
  platform: string;
  username: string;
  displayName: string;
  bio?: string;
  followers?: number;
  following?: number;
  verified?: boolean;
  avatar?: string;
  externalUrl?: string;
  posts: NormalizedPost[];
}

function toPost(record: NormalizedPost, platform: PlatformId, username: string): Post {
  return {
    id: `${platform}_${record.id}`,
    platform,
    author: username,
    authorHandle: `@${username}`,
    content: record.text,
    timestamp: record.publishedAt ?? new Date().toISOString(),
    url: record.url,
    likes: record.metrics?.likes,
    comments: record.metrics?.comments,
    media: record.media.map(m => m.url),
    mediaItems: record.media.map(m => ({ type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video', url: m.url })),
    sourceKey: `${platform}:account:${username}`,
    sourceLabel: `@${username}`,
    sourceKind: "account",
  };
}

export async function fetchBrightDataProfile(
  platform: string,
  username: string,
): Promise<{ profile: NormalizedProfile; posts: Post[] }> {
  const data = await request<{ profile: NormalizedProfile }>(
    `/api/brightdata/profile/${encodeURIComponent(platform)}?username=${encodeURIComponent(username)}`,
  );

  const platformId = platform as PlatformId;
  const posts = data.profile.posts.map(p => toPost(p, platformId, data.profile.username));

  return { profile: data.profile, posts };
}

export async function getSupportedPlatforms(): Promise<{ platforms: string[]; configured: boolean }> {
  return request("/api/brightdata/platforms");
}

export async function checkStatus(): Promise<{ configured: boolean; supportedPlatforms: string[] }> {
  return request("/api/brightdata/status");
}

export async function subscribeToSource(
  platform: string,
  username: string,
  userId: string,
  plan?: string,
): Promise<{ sourceId: string }> {
  const data = await request<{ subscription: { sourceId: string } }>("/api/brightdata/sources", {
    method: "POST",
    body: JSON.stringify({ platform, username, userId, plan }),
  });
  return { sourceId: data.subscription.sourceId };
}

export { API_BASE_URL };
