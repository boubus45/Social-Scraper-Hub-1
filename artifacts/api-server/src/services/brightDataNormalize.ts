// Bright Data record normalization.
//
// One module owns the mapping from raw Bright Data records to our shapes, used
// by both the collection manager (webhook / snapshot ingestion) and the
// on-demand profile endpoint.
//
// Two record shapes come back from Bright Data:
//  1. Profile datasets (Instagram, LinkedIn, TikTok) return one object per
//     profile with a nested array of posts.
//  2. Post datasets (Facebook page posts, X posts) return one object per post.
import type { PlatformId } from './brightDataDatasets.ts';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

/** A single post as the profile endpoint returns it. */
export interface ProfilePost {
  id: string;
  url: string;
  text: string;
  publishedAt?: string;
  media: MediaItem[];
  metrics: PostMetrics;
}

/** A post as the feed returns it. */
export interface NormalizedPost {
  platform: PlatformId;
  username: string;
  platformPostId: string;
  url: string;
  text: string;
  publishedAt?: string;
  media: MediaItem[];
  metrics: PostMetrics;
}

export interface NormalizedProfile {
  platform: string;
  username: string;
  displayName: string;
  bio?: string;
  followers?: number;
  following?: number;
  verified?: boolean;
  avatar?: string;
  externalUrl?: string;
  posts: ProfilePost[];
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv)(\?|#|$)/i;

/** Known direct-media CDN hosts — if the URL is on one of these, treat it as
 *  media even without a recognizable extension. */
const MEDIA_CDN_HOSTS = /cdninstagram|fbcdn|tiktokcdn|twimg|ggpht|ytimg|scontent|pbs\.twimg|video\.twimg|vcdn|akamaized|cloudfront/i;

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return undefined;
}

/**
 * Only URLs we can prove are media are kept: TikTok/X/Facebook frequently hand
 * back page links (tiktok.com/@user/video/…) and feeding those to a video
 * player produces a broken player instead of a post.
 */
function mediaItem(url: unknown, forceType?: 'image' | 'video'): MediaItem | undefined {
  const value = asString(url);
  if (!value) return undefined;
  if (VIDEO_EXT.test(value)) return { type: 'video', url: value };
  if (IMAGE_EXT.test(value)) return { type: 'image', url: value };
  // CDN hosts without an extension are still direct media.
  if (MEDIA_CDN_HOSTS.test(value)) {
    return { type: forceType ?? 'image', url: value };
  }
  return undefined;
}

function pushMedia(target: MediaItem[], item: MediaItem | undefined): void {
  if (item && !target.some(m => m.url === item.url)) target.push(item);
}

function mediaFromAttachments(attachments: unknown): MediaItem[] {
  const media: MediaItem[] = [];
  if (!Array.isArray(attachments)) return media;

  for (const raw of attachments) {
    if (!raw || typeof raw !== 'object') continue;
    const attachment = raw as Record<string, unknown>;
    const isVideo = String(attachment.type ?? '').toLowerCase() === 'video';
    pushMedia(media, mediaItem(attachment.video_url, isVideo ? 'video' : undefined));
    pushMedia(media, mediaItem(attachment.thumbnail_url));
    pushMedia(media, mediaItem(attachment.cover_image));
    pushMedia(media, mediaItem(attachment.url, isVideo ? 'video' : undefined));
  }

  return media;
}

interface ProfileContext {
  /** TikTok separates posts from their video metadata; joined by id. */
  videosById?: Map<string, Record<string, unknown>>;
}

/**
 * Handle carried by a post itself. Deliberately excludes generic `id` fields:
 * on LinkedIn the profile id is a handle while a post's id is not.
 */
function postHandle(item: Record<string, unknown>): string | undefined {
  const handle = firstString(
    item.author_handle,
    item.account,
    item.account_id,
    item.username,
    item.user_username_raw,
    item.profile_handle,
  );
  return handle?.replace(/^@/, '');
}

function usernameOf(platform: string, record: Record<string, unknown>): string | undefined {
  switch (platform) {
    case 'instagram':
      return firstString(record.account, record.username, record.profile_url);
    case 'linkedin':
      return firstString(record.id, record.username);
    case 'tiktok':
      return firstString(record.account_id, record.username);
    case 'x':
    case 'twitter':
      // Handles arrive with an "@" the app adds back itself.
      return firstString(record.author_handle, record.user_posted, record.account, record.username)?.replace(
        /^@/,
        '',
      );
    case 'facebook':
      return firstString(record.user_username_raw, record.profile_handle, record.page_name, record.account);
    default:
      return firstString(record.account, record.username, record.id);
  }
}

function metricsOf(platform: string, item: Record<string, unknown>, context: ProfileContext): PostMetrics {
  const joinedVideo = asString(item.post_id)
    ? context.videosById?.get(asString(item.post_id)!)
    : undefined;

  switch (platform) {
    case 'linkedin': {
      // LinkedIn returns a display string such as "2,530 - 139 Comments".
      const interaction = asString(item.interaction) ?? '';
      const likes = interaction.match(/^\s*([\d.,]+)/)?.[1];
      const comments = interaction.match(/([\d.,]+)\s*comments/i)?.[1];
      return {
        likes: likes ? asNumber(likes) : undefined,
        comments: comments ? asNumber(comments) : undefined,
      };
    }
    case 'tiktok':
      return {
        likes: asNumber(item.likes) ?? asNumber(item.like_count),
        comments: asNumber(item.commentcount) ?? asNumber(joinedVideo?.commentcount),
        shares: asNumber(item.share_count) ?? asNumber(joinedVideo?.share_count),
        views: asNumber(item.playcount) ?? asNumber(joinedVideo?.playcount),
      };
    case 'facebook':
      return {
        likes: asNumber(item.likes) ?? asNumber(item.like_count),
        comments: asNumber(item.num_comments) ?? asNumber(item.comments_count),
        shares: asNumber(item.num_shares) ?? asNumber(item.shares),
        views: asNumber(item.video_view_count) ?? asNumber(item.play_count),
      };
    case 'x':
    case 'twitter':
      // Covers both marketplace X datasets (likes/replies/reposts) and the
      // Scraper Studio scraper used for profile timelines (like_count/…).
      return {
        likes: asNumber(item.like_count) ?? asNumber(item.likes),
        comments: asNumber(item.reply_count) ?? asNumber(item.replies),
        shares: asNumber(item.repost_count) ?? asNumber(item.reposts),
        views: asNumber(item.view_count) ?? asNumber(item.views),
      };
    default:
      // Instagram's profile dataset returns no per-post engagement.
      return {
        likes: asNumber(item.like_count) ?? asNumber(item.likes),
        comments: asNumber(item.comments_count) ?? asNumber(item.num_comments),
        shares: asNumber(item.shares),
        views: asNumber(item.view_count) ?? asNumber(item.views),
      };
  }
}

function mediaOf(platform: string, item: Record<string, unknown>, context: ProfileContext): MediaItem[] {
  const media: MediaItem[] = [];

  switch (platform) {
    case 'instagram': {
      // Reels carry a cover in image_url and the playable file in video_url
      // (sometimes video_url_download). Try the video first so a reel plays
      // instead of showing its cover; fall back to image_url for photo posts.
      pushMedia(media, mediaItem(item.video_url, 'video'));
      pushMedia(media, mediaItem(item.video_url_download, 'video'));
      pushMedia(media, mediaItem(item.image_url));
      break;
    }
    case 'tiktok': {
      const joinedVideo = asString(item.post_id)
        ? context.videosById?.get(asString(item.post_id)!)
        : undefined;
      pushMedia(media, mediaItem(joinedVideo?.cover_image));
      pushMedia(media, mediaItem(item.cover_image));
      pushMedia(media, mediaItem(item.thumbnail_url));
      break;
    }
    case 'facebook':
      for (const entry of mediaFromAttachments(item.attachments)) pushMedia(media, entry);
      pushMedia(media, mediaItem(item.image_url));
      break;
    case 'x':
    case 'twitter': {
      pushMedia(media, mediaItem(item.media_image_url));
      // author_profile_image is the avatar, not post media.
      const photos = Array.isArray(item.photos) ? item.photos : [];
      for (const photo of photos) pushMedia(media, mediaItem(photo));
      // X video posts carry the playable file in video_url or a videos[] array
      // of {url} objects; mediaItem rejects plain page links, so when no direct
      // file is present the cover image is all that survives.
      pushMedia(media, mediaItem(item.video_url, 'video'));
      const videos = Array.isArray(item.videos) ? item.videos : [];
      for (const video of videos) {
        const url =
          typeof video === 'object'
            ? (video as any).url ?? (video as any).video_url
            : video;
        pushMedia(media, mediaItem(url, 'video'));
      }
      break;
    }
    default:
      pushMedia(media, mediaItem(item.image_url));
      pushMedia(media, mediaItem(item.display_url));
      pushMedia(media, mediaItem(item.video_url, 'video'));
      pushMedia(media, mediaItem(item.thumbnail_url));
  }

  return media;
}

function textOf(platform: string, item: Record<string, unknown>): string {
  const direct = firstString(item.text, item.caption, item.content, item.description, item.post_text);
  if (direct) return direct;

  if (platform === 'linkedin') {
    const title = asString(item.title) ?? '';
    const attribution = asString(item.attribution) ?? '';
    const combined = [title, attribution].filter(Boolean).join('\n');
    if (combined) return combined;
  }

  return '';
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function monthIndex(name: string): number | undefined {
  const probe = Date.parse(`1 ${name.slice(0, 3)} 2000`);
  if (Number.isNaN(probe)) return undefined;
  return new Date(probe).getMonth();
}

/**
 * X shows timestamps the way the UI does ("8:31 PM · Sep 25, 2026", "Sep 25",
 * sometimes a relative "2h"). Feed consumers need an ISO date, so parse the
 * formats we can recognise and give up on the rest rather than shipping an
 * "Invalid Date" string.
 */
function toIsoTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;

  // "8:31 PM · Sep 25, 2026" — split the clock off, then date + optional year.
  const timed = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:·|-|–|\|)\s*(.+)$/i);
  const time = timed ? { hour: Number(timed[1]), minute: Number(timed[2]), meridiem: timed[3]?.toLowerCase() } : undefined;
  const datePart = (timed ? timed[4] : raw).trim();

  const dated = datePart.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?$/);
  if (dated) {
    const month = monthIndex(dated[1]);
    const day = Number(dated[2]);
    if (month !== undefined && day > 0) {
      const year = dated[3] ? Number(dated[3]) : new Date().getFullYear();
      let hour = time?.hour ?? 0;
      if (time?.meridiem === 'pm' && hour < 12) hour += 12;
      if (time?.meridiem === 'am' && hour === 12) hour = 0;
      const parsed = new Date(year, month, day, hour, time?.minute ?? 0);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  // Fall back to the engine's parser for anything else (e.g. ISO variants).
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback.toISOString();
}

/**
 * X snowflake ids embed their own creation time. The scraper leaves posted_date
 * empty on retweets, and without this the feed would show them as "now".
 */
function snowflakeTimestamp(platform: string, id: string | undefined): string | undefined {
  if (platform !== "x" && platform !== "twitter") return undefined;
  if (!id || !/^\d{15,25}$/.test(id)) return undefined;
  try {
    const ms = Number(BigInt(id) >> 22n) + 1288834974657;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

function publishedAtOf(item: Record<string, unknown>): string | undefined {
  return toIsoTimestamp(
    firstString(
      item.datetime,
      item.date_posted,
      item.posted_date,
      item.created_at,
      item.create_time,
      item.create_date,
      item.published_at,
      item.timestamp,
      item.date,
    ),
  );
}

/** Status URLs canonicalise to the tweet id, which is stable across scrapes. */
function idOf(platform: string, item: Record<string, unknown>): string | undefined {
  const direct = firstString(item.id, item.post_id, item.video_id);
  if (direct) return direct;

  const url = firstString(item.url, item.post_url);
  if (!url) return undefined;

  if (platform === 'x' || platform === 'twitter') {
    const status = url.match(/\/status(?:es)?\/(\d+)/);
    if (status) return status[1];
  }
  return url;
}

/** Trims X's /photo/1 and /video/1 suffixes so links join on one canonical URL. */
function urlOf(platform: string, item: Record<string, unknown>): string {
  const url = asString(item.url) ?? asString(item.link) ?? asString(item.post_url) ?? '';
  if ((platform === 'x' || platform === 'twitter') && /\/status(?:es)?\/\d+\/(photo|video|photo\/\d)/.test(url)) {
    return url.replace(/\/(?:photo|video)(?:\/\d+)?\/?$/, '');
  }
  return url;
}

/** Key holding nested posts, when this platform wraps them. */
const NESTED_POSTS_KEY: Record<string, string | undefined> = {
  instagram: 'posts',
  linkedin: 'posts',
  tiktok: 'top_posts_data',
  // Scraper Studio scrapers answer { posts: [...] } per input URL.
  x: 'posts',
  twitter: 'posts',
};

/**
 * Posts nested inside a profile record, or null when the record *is* a post.
 * Owning the key with an empty array means "profile with no posts", so that
 * returns [] rather than null — otherwise the profile itself would be read as
 * if it were a post.
 */
function nestedPosts(platform: string, record: Record<string, unknown>): Record<string, unknown>[] | null {
  const key = NESTED_POSTS_KEY[platform];
  if (!key || !(key in record)) return null;

  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter(entry => entry && typeof entry === 'object') as Record<string, unknown>[];
}

function videoContext(platform: string, record: Record<string, unknown>): ProfileContext {
  if (platform !== 'tiktok') return {};
  if (!Array.isArray(record.top_videos)) return {};

  const videosById = new Map<string, Record<string, unknown>>();
  for (const video of record.top_videos as Record<string, unknown>[]) {
    const id = asString(video?.video_id);
    if (id) videosById.set(id, video);
  }
  return { videosById };
}

/**
 * Turns raw records into feed posts, flattening profile records into their
 * posts. Records without an id are skipped instead of collapsing into one
 * shared "undefined" post id.
 */
export function normalizeFeedRecords(
  platform: PlatformId,
  records: unknown[],
  fallbackUsername: string,
): NormalizedPost[] {
  const posts: NormalizedPost[] = [];

  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const context = videoContext(platform, record);
    const recordUsername = usernameOf(platform, record) ?? fallbackUsername;
    const items = nestedPosts(platform, record) ?? [record];

    for (const item of items) {
      const id = idOf(platform, item);
      if (!id) continue;

      posts.push({
        platform,
        // Post-level handles win: the X scraper wraps posts in a record that
        // carries no handle of its own.
        username: postHandle(item) ?? recordUsername,
        platformPostId: id,
        url: urlOf(platform, item),
        text: textOf(platform, item),
        publishedAt: publishedAtOf(item) ?? snowflakeTimestamp(platform, id),
        media: mediaOf(platform, item, context),
        metrics: metricsOf(platform, item, context),
      });
    }
  }

  return posts;
}

/**
 * Builds the profile view for the on-demand endpoint: profile metadata plus
 * its posts, using the same per-post mapping as the feed.
 */
export function normalizeProfile(platform: string, raw: Record<string, unknown>): NormalizedProfile {
  const context = videoContext(platform, raw);
  const username = usernameOf(platform, raw) ?? '';
  const items = nestedPosts(platform, raw) ?? [];

  const posts: ProfilePost[] = [];
  for (const item of items) {
    const id = idOf(platform, item);
    if (!id) continue;
    posts.push({
      id,
      url: urlOf(platform, item),
      text: textOf(platform, item),
      publishedAt: publishedAtOf(item),
      media: mediaOf(platform, item, context),
      metrics: metricsOf(platform, item, context),
    });
  }

  const externalUrl = Array.isArray(raw.external_url)
    ? asString((raw.external_url as unknown[])[0])
    : asString(raw.external_url) ?? asString(raw.page_external_website);

  return {
    platform,
    username,
    displayName:
      firstString(raw.full_name, raw.name, raw.nickname, raw.profile_name, raw.page_name) ?? username,
    bio: firstString(raw.biography, raw.about, raw.signature, raw.page_intro),
    followers: asNumber(raw.followers) ?? asNumber(raw.page_followers),
    following: asNumber(raw.following),
    verified:
      typeof raw.is_verified === 'boolean'
        ? raw.is_verified
        : typeof raw.page_is_verified === 'boolean'
          ? raw.page_is_verified
          : undefined,
    avatar:
      firstString(raw.profile_image_link, raw.avatar, raw.profile_pic_url, raw.page_logo, raw.avatar_image_url),
    externalUrl,
    posts,
  };
}
