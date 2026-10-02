import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { users, apifyConfigs, apifySources, apifyPosts, apifyRuns } from "@workspace/db/schema";
import { logger } from "../lib/logger";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const db = drizzle(pool, { schema: { users, apifyConfigs, apifySources, apifyPosts, apifyRuns } });

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_UNIFIED_ACTOR_ID = process.env.APIFY_UNIFIED_ACTOR_ID ?? process.env.APIFY_SOCIAL_MONITOR_ACTOR_ID;

// Platform-specific actor IDs (can be overridden via env vars)
const PLATFORM_ACTOR_IDS: Record<string, string | undefined> = {
  instagram: process.env.APIFY_INSTAGRAM_ACTOR_ID ?? APIFY_UNIFIED_ACTOR_ID,
  reddit: process.env.APIFY_REDDIT_ACTOR_ID ?? APIFY_UNIFIED_ACTOR_ID,
  tiktok: process.env.APIFY_TIKTOK_ACTOR_ID,
  x: process.env.APIFY_X_ACTOR_ID,
  facebook: process.env.APIFY_FACEBOOK_ACTOR_ID,
  linkedin: process.env.APIFY_LINKEDIN_ACTOR_ID,
};

if (!APIFY_API_TOKEN) {
  logger.warn("APIFY_API_TOKEN not set — Apify collections will fail");
}
if (!APIFY_UNIFIED_ACTOR_ID) {
  logger.warn("APIFY_UNIFIED_ACTOR_ID not set — unified actor unavailable");
}

// Check which platforms have actors configured
Object.entries(PLATFORM_ACTOR_IDS).forEach(([platform, actorId]) => {
  if (!actorId) {
    logger.warn(`No actor configured for ${platform} (set APIFY_${platform.toUpperCase()}_ACTOR_ID)`);
  }
});

export type PlatformId = 'instagram' | 'tiktok' | 'x' | 'facebook' | 'reddit' | 'linkedin';

export interface PlatformConfig {
  platform: PlatformId;
  enabled: boolean;
  credentials?: Record<string, string>;
  followedAccounts: string[];
  fetchEnabled: boolean;
  postEnabled: boolean;
}

export interface ApifySource {
  id: string;
  userId: string;
  platform: PlatformId;
  username: string;
  datasetId?: string;
  status: 'active' | 'paused' | 'error';
  lastCollectedAt?: string;
  subscriberCount: number;
  createdAt: string;
}

export interface ApifyPost {
  id: string;
  platform: PlatformId;
  platformPostId: string;
  username: string;
  url: string;
  text: string;
  publishedAt?: string;
  media: Array<{ type: 'image' | 'video'; url: string }>;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  author?: string;
  authorHandle?: string;
  sourceKey?: string;
  sourceLabel?: string;
  sourceKind?: string;
  isOfficial?: boolean;
  mediaItems?: Array<{ type: 'image' | 'video'; url: string }>;
  isNew?: boolean;
}

interface UserConfig {
  userId: string;
  platforms: Record<PlatformId, PlatformConfig>;
  updatedAt: string;
}

/** Default platform configuration */
function defaultPlatformConfig(platform: PlatformId): PlatformConfig {
  return {
    platform,
    enabled: false,
    followedAccounts: [],
    fetchEnabled: false,
    postEnabled: false,
  };
}

function defaultUserConfig(userId: string): UserConfig {
  const platforms = ['instagram', 'tiktok', 'x', 'facebook', 'reddit', 'linkedin'] as PlatformId[];
  return {
    userId,
    platforms: Object.fromEntries(platforms.map(p => [p, defaultPlatformConfig(p)])) as Record<PlatformId, PlatformConfig>,
    updatedAt: new Date().toISOString(),
  };
}

/** Load or create user configuration */
async function getUserConfig(userId: string): Promise<UserConfig> {
  const existing = await db.select().from(apifyConfigs).where(eq(apifyConfigs.userId, userId)).limit(1);
  if (existing.length > 0) {
    const row = existing[0];
    return {
      userId: row.userId,
      platforms: row.platforms as Record<PlatformId, PlatformConfig>,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }
  const config = defaultUserConfig(userId);
  await db.insert(apifyConfigs).values({
    userId,
    platforms: config.platforms,
    updatedAt: new Date(config.updatedAt),
  } as any);
  return config;
}

/** Save user configuration */
async function saveUserConfig(config: UserConfig): Promise<void> {
  await db.insert(apifyConfigs)
    .values({
      userId: config.userId,
      platforms: config.platforms,
      updatedAt: new Date(config.updatedAt),
    } as any)
    .onConflictDoUpdate({
      target: apifyConfigs.userId,
      set: { platforms: config.platforms, updatedAt: new Date(config.updatedAt) },
    });
}

/** Get platform config for a user */
export async function getPlatformConfig(userId: string, platform: PlatformId): Promise<PlatformConfig> {
  const config = await getUserConfig(userId);
  return config.platforms[platform] ?? defaultPlatformConfig(platform);
}

/** Update platform config for a user */
export async function updatePlatformConfig(userId: string, platform: PlatformId, patch: Partial<PlatformConfig>): Promise<void> {
  const config = await getUserConfig(userId);
  config.platforms[platform] = { ...config.platforms[platform], ...patch };
  await saveUserConfig(config);
}

/** Get all platform configs for a user */
export async function getConfig(userId: string): Promise<Record<PlatformId, PlatformConfig>> {
  const config = await getUserConfig(userId);
  return config.platforms;
}

/** Subscribe to a source (follow an account) */
export async function subscribeSource(userId: string, platform: PlatformId, username: string): Promise<ApifySource> {
  const normalizedUsername = username.trim().replace(/^[@/]/, '');
  if (!normalizedUsername) throw new Error("Invalid username");

  const existing = await db.select().from(apifySources)
    .where(and(eq(apifySources.userId, userId), eq(apifySources.platform, platform), eq(apifySources.username, normalizedUsername)))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    return {
      id: row.id,
      userId: row.userId,
      platform: row.platform as PlatformId,
      username: row.username,
      datasetId: row.datasetId ?? undefined,
      status: row.status as any,
      lastCollectedAt: row.lastCollectedAt ? (row.lastCollectedAt instanceof Date ? row.lastCollectedAt.toISOString() : String(row.lastCollectedAt)) : undefined,
      subscriberCount: row.subscriberCount,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date();

  await db.insert(apifySources).values({
    id: sourceId,
    userId,
    platform,
    username: normalizedUsername,
    status: 'active',
    subscriberCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Update platform config to include this account
  const config = await getPlatformConfig(userId, platform);
  if (!config.followedAccounts.includes(normalizedUsername)) {
    await updatePlatformConfig(userId, platform, {
      followedAccounts: [...config.followedAccounts, normalizedUsername],
      fetchEnabled: true,
    });
  }

  return {
    id: sourceId,
    userId,
    platform,
    username: normalizedUsername,
    status: 'active',
    subscriberCount: 1,
    createdAt: now.toISOString(),
  };
}

/** Unsubscribe from a source */
export async function unsubscribeSource(userId: string, platform: PlatformId, username: string): Promise<void> {
  const normalizedUsername = username.trim().replace(/^[@/]/, '');
  await db.delete(apifySources)
    .where(and(eq(apifySources.userId, userId), eq(apifySources.platform, platform), eq(apifySources.username, normalizedUsername)));

  // Update followed accounts
  const config = await getPlatformConfig(userId, platform);
  await updatePlatformConfig(userId, platform, {
    followedAccounts: config.followedAccounts.filter(a => a !== username),
  });
}

/** Get all subscribed sources for a user */
export async function getSources(userId: string): Promise<ApifySource[]> {
  const rows = await db.select().from(apifySources).where(eq(apifySources.userId, userId));
  const result: ApifySource[] = [];
  for (const row of rows) {
    // Robust date serialization - handle Date objects, strings, and null/undefined
    let createdAt: string;
    if (row.createdAt instanceof Date) {
      createdAt = row.createdAt.toISOString();
    } else if (row.createdAt) {
      // If it's already a string or number, convert to Date then ISO
      const date = new Date(row.createdAt);
      createdAt = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } else {
      createdAt = new Date().toISOString();
    }
    
    let lastCollectedAt: string | undefined;
    if (row.lastCollectedAt) {
      if (row.lastCollectedAt instanceof Date) {
        lastCollectedAt = row.lastCollectedAt.toISOString();
      } else {
        const date = new Date(row.lastCollectedAt);
        lastCollectedAt = isNaN(date.getTime()) ? undefined : date.toISOString();
      }
    }
    
    result.push({
      id: row.id,
      userId: row.userId,
      platform: row.platform as PlatformId,
      username: row.username,
      datasetId: row.datasetId ?? undefined,
      status: row.status as any,
      lastCollectedAt,
      subscriberCount: row.subscriberCount,
      createdAt,
    });
  }
  return result;
}

/** Get feed posts for a user */
export async function getFeed(userId: string, options: { platform?: string; limit?: number; cursor?: string } = {}): Promise<any[]> {
  const { platform, limit = 100, cursor } = options;
  const conditions = [eq(apifyPosts.userId, userId)];
  
  if (platform) {
    conditions.push(eq(apifyPosts.platform, platform));
  }
  
  if (cursor) {
    conditions.push(gte(apifyPosts.id, cursor));
  }

  const posts = await db.select().from(apifyPosts).where(and(...conditions)).orderBy(desc(apifyPosts.publishedAt)).limit(limit);

  function extractAuthorFromSourceLabel(sourceLabel: string | null | undefined): { author?: string; authorHandle?: string } {
  if (!sourceLabel) return {};
  try {
    const parsed = JSON.parse(sourceLabel);
    if (parsed.username) {
      return { author: parsed.username, authorHandle: `@${parsed.username}` };
    }
  } catch {
    // Not JSON, treat as plain username
    if (sourceLabel && sourceLabel !== 'Unknown') {
      return { author: sourceLabel, authorHandle: `@${sourceLabel}` };
    }
  }
  return {};
}

  const result: any[] = [];
  for (const row of posts) {
    const fallback = extractAuthorFromSourceLabel(row.sourceLabel);
    result.push({
      id: row.id,
      platform: row.platform as PlatformId,
      platformPostId: row.platformPostId,
      username: row.username ?? fallback.authorHandle?.replace('@', ''),
      url: row.url,
      text: row.text ?? '',
      publishedAt: row.publishedAt ? (row.publishedAt instanceof Date ? row.publishedAt.toISOString() : String(row.publishedAt)) : undefined,
      media: row.media as any,
      metrics: row.metrics as any,
      author: row.author ?? fallback.author,
      authorHandle: row.authorHandle ?? fallback.authorHandle,
      sourceKey: row.sourceKey ?? undefined,
      sourceLabel: row.sourceLabel ?? undefined,
      sourceKind: row.sourceKind ?? undefined,
      isOfficial: row.isOfficial ?? undefined,
      mediaItems: row.mediaItems as any,
      isNew: row.isNew ?? undefined,
    });
  }
  return result;
}

/** Get the actor ID for a platform */
function getActorId(platform: string): string {
  const actorId = PLATFORM_ACTOR_IDS[platform];
  if (!actorId) {
    throw new Error(`No Apify actor configured for platform: ${platform}. Set APIFY_${platform.toUpperCase()}_ACTOR_ID`);
  }
  return actorId;
}

/** Build input for platform-specific actor */
function buildActorInput(platform: string, username: string, sourceId: string): any {
  const baseInput = {
    maxPostsPerAccount: 20,
    limit: 20,
    onlyNew: false,
    monitorId: sourceId,
  };

  switch (platform) {
    case 'instagram':
    case 'tiktok':
    case 'x':
    case 'linkedin':
      return { ...baseInput, accounts: [username] };
    case 'reddit':
      return { ...baseInput, sources: [username], platform: 'reddit' };
    case 'facebook':
      return { ...baseInput, pages: [username] };
    default:
      return { ...baseInput, accounts: [username], platform };
  }
}

/** Trigger collection for a specific platform/account via Apify */
export async function collectPlatform(userId: string, platform: string, username: string): Promise<{ runId: string; datasetId?: string; added: number }> {
  if (!APIFY_API_TOKEN) {
    throw new Error("Apify not configured (APIFY_API_TOKEN missing)");
  }

  const actorId = getActorId(platform);

  const source = await db.select().from(apifySources)
    .where(and(eq(apifySources.userId, userId), eq(apifySources.platform, platform), eq(apifySources.username, username)))
    .limit(1);

  if (source.length === 0) {
    throw new Error("Source not found");
  }

  const sourceRecord = source[0];

  // Trigger Apify actor run
  const actorInput = buildActorInput(platform, username, source[0].id);
  
  const response = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(APIFY_API_TOKEN)}&waitForFinish=120`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actorInput),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Apify run creation failed (${response.status}): ${detail.trim()}`);
  }

  const body = (await response.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } };
  if (!body.data?.id) throw new Error("Apify returned no run ID");

  const runId = body.data.id;
  const datasetId = body.data.defaultDatasetId;

  // Store run record
  const runIdRecord = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await db.insert(apifyRuns).values({
    id: runIdRecord,
    userId,
    platform,
    sourceId: source[0].id,
    runId,
    datasetId,
    status: body.data.status ?? 'RUNNING',
    startedAt: new Date(),
  } as any);

  // If dataset is ready, fetch and store posts
  let added = 0;
  if (datasetId) {
    added = await fetchAndStoreDataset(source[0].id, datasetId, userId);
  }

  // Update source last collected
  await db.update(apifySources)
    .set({ lastCollectedAt: new Date() })
    .where(eq(apifySources.id, source[0].id));

  return { runId, datasetId, added };
}

/** Fetch dataset from Apify and store posts */
async function fetchAndStoreDataset(sourceId: string, datasetId: string, userId: string): Promise<number> {
  if (!APIFY_API_TOKEN) return 0;

  const dataset = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(APIFY_API_TOKEN)}&clean=true`
  );
  if (!dataset.ok) throw new Error(`Apify dataset read failed (${dataset.status})`);

  const items = await dataset.json() as any[];
  if (!items.length) return 0;

  let added = 0;
  for (const item of items) {
    const postId = item.id ?? item.post_id ?? item.id_str ?? `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Check if already exists
    const existing = await db.select().from(apifyPosts).where(eq(apifyPosts.platformPostId, postId)).limit(1);
    if (existing.length > 0) continue;

    // Normalize the item based on platform
    const normalized = normalizeApifyItem(item);
    if (!normalized) continue;

    await db.insert(apifyPosts).values({
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      platform: normalized.platform,
      platformPostId: postId,
      url: normalized.url,
      text: normalized.text,
      publishedAt: normalized.publishedAt ? new Date(normalized.publishedAt) : null,
      media: normalized.media as any,
      metrics: normalized.metrics as any,
      author: normalized.author,
      authorHandle: normalized.authorHandle,
      sourceKey: normalized.sourceKey,
      sourceLabel: normalized.sourceLabel,
      sourceKind: normalized.sourceKind,
      isOfficial: normalized.isOfficial ? 1 : 0,
      mediaItems: normalized.mediaItems as any,
    } as any);
    added++;
  }

  return added;
}

/** Normalize Apify item to our post format */
function normalizeApifyItem(item: any): any | null {
  // The unified actor returns data in this format:
  // { platform, account: {username}, post: {id, url, text, publishedAt, media}, metrics, monitorId }
  // Or for Reddit: { platform, account, post: {id, url, text, publishedAt, media}, metrics, monitorId }
  
  const platform = item.platform ?? item.platform_type ?? 'unknown';
  const postData = item.post ?? item;
  const accountData = item.account ?? {};
  
  const media: Array<{ type: 'image' | 'video'; url: string }> = [];
  
  // Handle media from post.media array
  if (postData.media && Array.isArray(postData.media)) {
    for (const m of postData.media) {
      if (m.url && m.type) {
        media.push({ type: m.type, url: m.url });
      }
    }
  }
  
  // Also check for direct media fields (legacy format)
  if (item.video_url && typeof item.video_url === 'string' && item.video_url.startsWith('http')) {
    media.push({ type: 'video', url: item.video_url });
  }
  if (item.video_url_download && typeof item.video_url_download === 'string' && item.video_url_download.startsWith('http')) {
    media.push({ type: 'video', url: item.video_url_download });
  }
  if (item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')) {
    media.push({ type: 'image', url: item.image_url });
  }
  if (item.cover_image && typeof item.cover_image === 'string' && item.cover_image.startsWith('http')) {
    media.push({ type: 'image', url: item.cover_image });
  }
  if (item.thumbnail_url && typeof item.thumbnail_url === 'string' && item.thumbnail_url.startsWith('http')) {
    media.push({ type: 'image', url: item.thumbnail_url });
  }
  if (item.media && Array.isArray(item.media)) {
    for (const m of item.media) {
      if (m.url && m.type) {
        media.push({ type: m.type, url: m.url });
      }
    }
  }

  const username = accountData.username ?? item.username ?? item.handle ?? 'unknown';
  const author = accountData.displayName ?? item.author ?? item.author_name ?? item.full_name ?? item.name ?? username;
  const authorHandle = accountData.username ? `@${accountData.username}` : (item.authorHandle ?? item.author_username ?? item.username ?? item.handle ?? undefined);

  // Explicitly extract text from post object (Apify unified actor puts text in post.text)
  // Also handle cases where text might be in different fields
  const text = postData.text ?? item.post?.text ?? item.text ?? item.caption ?? item.content ?? item.description ?? 
               postData.caption ?? postData.caption_text ?? postData.accessibility_caption ?? 
               postData.selftext ?? item.selftext ?? '';

  // Debug log for text extraction
  if (!text || text.trim() === '') {
    logger.warn({ 
      platform, 
      postId: postData.id ?? item.id,
      hasPostData: !!postData,
      postKeys: Object.keys(postData),
      itemKeys: Object.keys(item),
      postDataText: postData.text,
      itemText: item.text,
      caption: item.caption,
      selftext: item.selftext,
    }, 'Text extraction resulted in empty string');
  }

  return {
    platform: platform as any,
    platformPostId: postData.id ?? item.id ?? item.post_id ?? item.id_str,
    url: postData.url ?? item.url ?? item.post_url ?? `https://${platform}.com/${username}`,
    text,
    publishedAt: postData.publishedAt ?? item.publishedAt ?? item.created_at ?? item.datetime ?? item.timestamp ?? new Date().toISOString(),
    media,
    metrics: {
      likes: postData.metrics?.likes ?? item.likes ?? item.like_count ?? 0,
      comments: postData.metrics?.comments ?? item.comments ?? item.comments_count ?? 0,
      shares: postData.metrics?.shares ?? item.shares ?? item.share_count ?? 0,
      views: postData.metrics?.views ?? item.views ?? item.view_count ?? item.play_count ?? 0,
    },
    author,
    authorHandle,
    sourceKey: `${platform}:account:${username}`,
    sourceLabel: accountData.displayName ?? username ?? item.account ?? 'Unknown',
    sourceKind: 'account',
    isOfficial: item.is_verified ?? item.verified ?? accountData.is_verified ?? false,
    mediaItems: media,
  };
}

/** Collect all enabled platforms for a user */
export async function collectAllPlatforms(userId: string): Promise<{ results: Record<string, any> }> {
  const userConfig = await getUserConfig(userId);
  const results: Record<string, any> = {};

  for (const [platform, platformConfig] of Object.entries(userConfig.platforms)) {
    if (!platformConfig.fetchEnabled || platformConfig.followedAccounts.length === 0) continue;

    const platformResults: any[] = [];
    for (const username of platformConfig.followedAccounts) {
      try {
        const result = await collectPlatform(userId, platform, username);
        platformResults.push({ username, ...result });
      } catch (error) {
        platformResults.push({ username, error: error instanceof Error ? error.message : 'Failed' });
      }
    }
    results[platform] = platformResults;
  }

  return { results };
}

// Export all functions as a unified object for route handlers
export const apifyUnified = {
  getConfig,
  getPlatformConfig,
  updatePlatformConfig,
  subscribeSource,
  unsubscribeSource,
  getSources,
  getFeed,
  collectPlatform,
  collectAllPlatforms,
};