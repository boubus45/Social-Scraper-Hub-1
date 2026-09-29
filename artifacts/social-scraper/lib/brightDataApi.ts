import { Post, PlatformId } from "@/types";
import { API_BASE_URL } from "@/lib/apiConfig";

const DEFAULT_USER_ID = "local-user";

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

/** Platforms whose posts are collected by Bright Data (Reddit stays on Apify). */
export const BRIGHT_DATA_PLATFORMS: PlatformId[] = ["instagram", "linkedin", "tiktok", "x", "facebook"];

/** Platforms the backend can collect on demand — all of them: X runs on a
 *  Scraper Studio scraper and Facebook on a dataset that accepts /trigger. */
const ON_DEMAND_PLATFORMS: PlatformId[] = BRIGHT_DATA_PLATFORMS;

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

/** Shape returned by GET /api/brightdata/sources. */
export interface BrightDataSource {
  id: string;
  platform: PlatformId;
  username: string;
  datasetId: string;
  canonicalUrl: string;
  status: "active" | "paused" | "error";
  subscriberCount: number;
  createdAt: string;
  lastCollectedAt?: string;
  lastPostId?: string;
}

/** Shape of a post returned by GET /api/brightdata/feed. */
interface FeedPost {
  platform: PlatformId;
  username: string;
  platformPostId: string;
  url: string;
  text: string;
  publishedAt?: string;
  media: Array<{ type: string; url: string }>;
  metrics: { likes?: number; comments?: number; shares?: number; views?: number };
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

function feedPostToPost(record: FeedPost): Post {
  return {
    id: `${record.platform}_${record.platformPostId}`,
    platform: record.platform,
    author: record.username,
    authorHandle: `@${record.username}`,
    content: record.text,
    timestamp: record.publishedAt ?? new Date().toISOString(),
    url: record.url,
    likes: record.metrics?.likes,
    comments: record.metrics?.comments,
    reposts: record.metrics?.shares,
    media: record.media?.map(m => m.url) ?? [],
    mediaItems: (record.media ?? []).map(m => ({
      type: (m.type === "video" ? "video" : "image") as "image" | "video",
      url: m.url,
    })),
    sourceKey: `${record.platform}:account:${record.username}`,
    sourceLabel: `@${record.username}`,
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
  const data = await request<{ configured: boolean; supportedPlatforms?: string[] }>(
    "/api/brightdata/platforms",
  );
  return { platforms: data.supportedPlatforms ?? [], configured: !!data.configured };
}

export async function checkStatus(): Promise<{
  configured: boolean;
  supportedPlatforms: string[];
  sourcesCount: number;
}> {
  return request("/api/brightdata/status");
}

export async function subscribeToSource(
  platform: string,
  username: string,
  userId: string = DEFAULT_USER_ID,
  plan?: string,
): Promise<{ sourceId: string }> {
  const data = await request<{ source?: { id: string }; subscription?: { sourceId: string } }>(
    "/api/brightdata/sources",
    {
      method: "POST",
      body: JSON.stringify({ platform, username, userId, plan }),
    },
  );
  const sourceId = data.source?.id ?? data.subscription?.sourceId;
  if (!sourceId) throw new Error("Backend did not return a source id");
  return { sourceId };
}

export async function unsubscribeSource(
  platform: string,
  username: string,
  userId: string = DEFAULT_USER_ID,
): Promise<boolean> {
  const data = await request<{ ok: boolean }>(
    `/api/brightdata/sources/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`,
    { method: "DELETE", body: JSON.stringify({ userId }) },
  );
  return !!data.ok;
}

export async function listSources(userId: string = DEFAULT_USER_ID): Promise<BrightDataSource[]> {
  const data = await request<{ sources: BrightDataSource[] }>(
    `/api/brightdata/sources?userId=${encodeURIComponent(userId)}`,
  );
  return data.sources ?? [];
}

export async function fetchBrightDataFeed(userId: string = DEFAULT_USER_ID): Promise<Post[]> {
  const data = await request<{ posts: FeedPost[] }>(
    `/api/brightdata/feed?userId=${encodeURIComponent(userId)}`,
  );
  return (data.posts ?? []).map(feedPostToPost);
}

/** Fire-and-forget: ask the backend to run an immediate collection for a source. */
function triggerImmediateCollection(platform: PlatformId, username: string): void {
  if (!ON_DEMAND_PLATFORMS.includes(platform)) return;
  void fetch(
    `${API_BASE_URL}/api/brightdata/collect/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  ).catch(() => { /* the hourly loop still runs */ });
}

export interface SyncResult {
  subscribed: string[];
  unsubscribed: string[];
  warnings: string[];
}

/**
 * Makes the backend subscriptions match the accounts configured in Settings.
 * The feed only returns posts for subscribed sources, so without this call the
 * Bright Data feed would always be empty.
 */
export async function syncBrightDataSources(
  wanted: Array<{ platform: PlatformId; username: string }>,
  userId: string = DEFAULT_USER_ID,
): Promise<SyncResult> {
  const result: SyncResult = { subscribed: [], unsubscribed: [], warnings: [] };
  const wantedKeys = new Set(wanted.map(w => `${w.platform}:${w.username.toLowerCase()}`));

  let existing: BrightDataSource[] = [];
  try {
    existing = await listSources(userId);
  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : "Could not list sources");
    return result;
  }

  for (const item of wanted) {
    const alreadySubscribed = existing.some(
      s => s.platform === item.platform && s.username.toLowerCase() === item.username.toLowerCase(),
    );
    try {
      const { sourceId } = await subscribeToSource(item.platform, item.username, userId);
      if (!alreadySubscribed) {
        result.subscribed.push(`${item.platform}/${item.username}`);
        const source = existing.find(s => s.id === sourceId);
        if (!source?.lastCollectedAt) {
          triggerImmediateCollection(item.platform, item.username);
        }
      }
    } catch (error) {
      // Plan limits and transient backend errors must not abort the whole sync.
      result.warnings.push(
        `${item.platform}/${item.username}: ${error instanceof Error ? error.message : "subscribe failed"}`,
      );
    }
  }

  for (const source of existing) {
    if (!BRIGHT_DATA_PLATFORMS.includes(source.platform)) continue;
    if (wantedKeys.has(`${source.platform}:${source.username.toLowerCase()}`)) continue;
    try {
      await unsubscribeSource(source.platform, source.username, userId);
      result.unsubscribed.push(`${source.platform}/${source.username}`);
    } catch (error) {
      result.warnings.push(
        `unsubscribe ${source.platform}/${source.username}: ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  return result;
}

export { API_BASE_URL, DEFAULT_USER_ID };
