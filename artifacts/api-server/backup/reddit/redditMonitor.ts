import crypto from "node:crypto";

export interface RedditMonitor {
  id: string;
  userId: string;
  platform: "reddit";
  accounts: string[];
  limit: number;
  enabled: boolean;
  apifyRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RedditPostRecord {
  platform: "reddit";
  account: { username: string; displayName?: string };
  post: {
    id: string;
    url: string;
    text: string;
    publishedAt?: string;
    media: Array<{ type: "image" | "video"; url: string }>;
  };
  metrics: { likes: number; comments: number; shares: number; views: number };
  monitorId?: string;
}

const monitors = new Map<string, RedditMonitor>();
const feed = new Map<string, RedditPostRecord[]>();

function normalizeSource(value: string): string {
  return value.trim().replace(/^r\//i, "").toLowerCase();
}

export function createRedditMonitor(input: unknown): RedditMonitor {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const accounts = Array.isArray(body.accounts)
    ? [...new Set(body.accounts.filter((value): value is string => typeof value === "string").map(normalizeSource).filter(Boolean))]
    : [];
  if (accounts.length === 0) throw new Error("At least one Reddit subreddit or user is required.");
  if (accounts.length > 10) throw new Error("A Reddit monitor can include up to 10 sources.");
  const limit = Math.min(Math.max(typeof body.limit === "number" ? body.limit : 10, 1), 25);
  const now = new Date().toISOString();
  const monitor: RedditMonitor = {
    id: crypto.randomUUID(),
    userId: typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "local-user",
    platform: "reddit",
    accounts,
    limit,
    enabled: body.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  monitors.set(monitor.id, monitor);
  feed.set(monitor.id, []);
  return monitor;
}

export function getRedditMonitor(id: string) {
  return monitors.get(id);
}

export function updateRedditMonitor(id: string, input: unknown): RedditMonitor {
  const current = monitors.get(id);
  if (!current) throw new Error("Monitor not found.");
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const candidate = createRedditMonitor({ ...current, ...body });
  const updated = { ...candidate, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  monitors.delete(current.id);
  feed.set(updated.id, feed.get(current.id) ?? []);
  feed.delete(candidate.id);
  monitors.set(updated.id, updated);
  return updated;
}

export function setRedditRunId(id: string, apifyRunId: string) {
  const monitor = monitors.get(id);
  if (!monitor) throw new Error("Monitor not found.");
  const updated = { ...monitor, apifyRunId, updatedAt: new Date().toISOString() };
  monitors.set(id, updated);
  return updated;
}

export function addRedditFeedRecords(id: string, records: RedditPostRecord[]) {
  const existing = feed.get(id) ?? [];
  const known = new Set(existing.map(record => record.post.id));
  const fresh = records.filter(record => record.platform === "reddit" && record.post?.id && !known.has(record.post.id));
  feed.set(id, [...fresh, ...existing].slice(0, 1000));
  return fresh;
}

export function getRedditFeed(id: string) {
  return feed.get(id) ?? [];
}

export async function startRedditRun(monitor: RedditMonitor, credentials?: { clientId?: string; clientSecret?: string; username?: string; password?: string }) {
  const records = await fetchRedditDirectly(monitor, credentials);
  if (records.length > 0) {
    addRedditFeedRecords(monitor.id, records);
    return { id: "local", status: "SUCCEEDED", datasetId: undefined };
  }

  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_SOCIAL_MONITOR_ACTOR_ID;
  if (!token || !actorId) {
    throw new Error("No Reddit posts fetched. Reddit may be blocking this network.");
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=60`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "reddit",
        sources: monitor.accounts,
        limit: monitor.limit,
        monitorId: monitor.id,
      }),
    },
  );
  if (!response.ok) throw new Error(`Apify run creation failed (${response.status}): ${(await response.text()).trim()}`);
  const body = (await response.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } };
  if (!body.data?.id) throw new Error("Apify returned no run ID.");
  setRedditRunId(monitor.id, body.data.id);
  if (body.data.defaultDatasetId) {
    const dataset = await fetch(
      `https://api.apify.com/v2/datasets/${encodeURIComponent(body.data.defaultDatasetId)}/items?token=${encodeURIComponent(token)}&clean=true`,
    );
    if (!dataset.ok) throw new Error(`Apify dataset read failed (${dataset.status}): ${(await dataset.text()).trim()}`);
    addRedditFeedRecords(monitor.id, (await dataset.json()) as RedditPostRecord[]);
  }
  return { id: body.data.id, status: body.data.status ?? "RUNNING", datasetId: body.data.defaultDatasetId };
}

interface RedditOauthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// Store tokens with expiration
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getRedditOauthToken(credentials: {
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}): Promise<string | null> {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.username || !credentials.password) {
    return null;
  }

  const cacheKey = `${credentials.clientId}:${credentials.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  try {
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "User-Agent": "SocialScraperHub/1.0",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: credentials.username,
        password: credentials.password,
      }).toString(),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as RedditOauthToken;
    if (!data.access_token) return null;

    // Cache the token (expires_in is in seconds, refresh 5 min early)
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    });

    return data.access_token;
  } catch {
    return null;
  }
}

interface RedditJsonChild {
  data?: {
    id: string;
    title: string;
    selftext: string;
    permalink: string;
    url: string;
    author: string;
    created_utc: number;
    ups: number;
    num_comments: number;
    media?: {
      reddit_video?: {
        fallback_url: string;
        dash_url?: string;
        hls_url?: string;
      };
    } | null;
    secure_media?: {
      reddit_video?: {
        fallback_url: string;
        dash_url?: string;
        hls_url?: string;
      };
    } | null;
    preview?: {
      images?: Array<{
        source: { url: string; width: number; height: number };
        resolutions: Array<{ url: string; width: number; height: number }>;
      }>;
    };
    is_video: boolean;
    post_hint: string;
    domain: string;
  };
}

async function fetchRedditWithOauth(
  slug: string,
  isUser: boolean,
  limit: number,
  token: string,
): Promise<RedditPostRecord[]> {
  const records: RedditPostRecord[] = [];
  const endpoint = isUser
    ? `https://oauth.reddit.com/user/${encodeURIComponent(slug)}/submitted?limit=${limit}&raw_json=1`
    : `https://oauth.reddit.com/r/${encodeURIComponent(slug)}/hot?limit=${limit}&raw_json=1`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "Authorization": `bearer ${token}`,
        "User-Agent": "SocialScraperHub/1.0",
      },
    });

    if (!response.ok) return records;
    const data = (await response.json()) as { data?: { children?: RedditJsonChild[] } };
    const children = data.data?.children ?? [];

    for (const child of children) {
      const post = child.data;
      if (!post) continue;

      const media: Array<{ type: "image" | "video"; url: string }> = [];

      // Extract video from secure_media or media
      const videoData = post.secure_media?.reddit_video ?? post.media?.reddit_video;
      if (videoData?.fallback_url) {
        media.push({ type: "video", url: videoData.fallback_url });
      }

      // Extract preview images
      if (post.preview?.images) {
        for (const img of post.preview.images) {
          const imgUrl = decodeHtmlEntities(img.source.url);
          if (!media.some(m => m.url === imgUrl)) {
            media.push({ type: "image", url: imgUrl });
          }
        }
      }

      // Direct image/video URL
      if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(post.url)) {
        if (!media.some(m => m.url === post.url)) {
          media.push({ type: "image", url: post.url });
        }
      }

      // If no media extracted but it's a video post, add the permalink as fallback
      if (media.length === 0 && post.is_video && post.permalink) {
        // Try to get video info from the post URL
        media.push({ type: "image", url: `https://www.reddit.com${post.permalink}` });
      }

      const text = post.selftext || post.title;
      records.push({
        platform: "reddit",
        account: {
          username: slug,
          displayName: isUser ? `u/${slug}` : `r/${slug}`,
        },
        post: {
          id: post.id,
          url: `https://www.reddit.com${post.permalink}`,
          text: text.slice(0, 2000),
          publishedAt: new Date(post.created_utc * 1000).toISOString(),
          media,
        },
        metrics: {
          likes: post.ups ?? 0,
          comments: post.num_comments ?? 0,
          shares: 0,
          views: 0,
        },
        monitorId: "", // filled in by caller
      });
    }
  } catch (error) {
    console.error(`Reddit OAuth fetch error for ${slug}:`, error);
  }

  return records;
}

async function fetchRedditDirectly(
  monitor: RedditMonitor,
  credentials?: { clientId?: string; clientSecret?: string; username?: string; password?: string },
): Promise<RedditPostRecord[]> {
  // Try OAuth first if credentials are available
  const creds = credentials ?? (monitor as unknown as { oauthCredentials?: typeof credentials }).oauthCredentials;
  if (creds?.clientId && creds?.clientSecret && creds?.username && creds?.password) {
    const token = await getRedditOauthToken(creds);
    if (token) {
      const records: RedditPostRecord[] = [];
      for (const rawSource of monitor.accounts.slice(0, 10)) {
        const trimmed = rawSource.trim().replace(/^r\//i, "");
        const isUser = trimmed.toLowerCase().startsWith("u/");
        const slug = isUser ? trimmed.slice(2) : trimmed;
        if (!/^[a-zA-Z0-9_]{1,50}$/.test(slug)) continue;

        const sourceRecords = await fetchRedditWithOauth(slug, isUser, monitor.limit, token);
        for (const r of sourceRecords) {
          r.monitorId = monitor.id;
        }
        records.push(...sourceRecords);
      }
      if (records.length > 0) return records;
      // Fall back to RSS if OAuth returns nothing
    }
  }

  // Fallback: RSS feed parsing
  const records: RedditPostRecord[] = [];
  for (const rawSource of monitor.accounts.slice(0, 10)) {
    const trimmed = rawSource.trim().replace(/^r\//i, "");
    const isUser = trimmed.toLowerCase().startsWith("u/");
    const slug = isUser ? trimmed.slice(2) : trimmed;
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(slug)) continue;

    const endpoint = isUser
      ? `https://www.reddit.com/user/${encodeURIComponent(slug)}/.rss?limit=${monitor.limit}`
      : `https://www.reddit.com/r/${encodeURIComponent(slug)}/.rss?limit=${monitor.limit}`;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(endpoint, {
          headers: {
            Accept: "application/atom+xml, application/xml, text/xml",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
      } catch { /* retry */ }
      if (response && response.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      break;
    }
    if (!response?.ok) continue;

    const xml = await response.text();
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
    for (const entry of entries) {
      const title = cleanAtomContent(atomText(entry, "title"));
      const rawContent = cleanAtomContent(atomText(entry, "content"));
      
      // Extract images from HTML content before stripping tags
      const contentMedia: Array<{ type: 'image' | 'video'; url: string }> = [];
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(rawContent))) {
        const imgUrl = imgMatch[1];
        if (imgUrl && !imgUrl.startsWith('data:') && !contentMedia.some(m => m.url === imgUrl)) {
          contentMedia.push({ type: 'image', url: imgUrl });
        }
      }
      
      // Also check for links to images
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*<\/a>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(rawContent))) {
        const linkUrl = linkMatch[1];
        if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(linkUrl) && !contentMedia.some(m => m.url === linkUrl)) {
          contentMedia.push({ type: 'image', url: linkUrl });
        }
      }
      
      // Strip HTML tags, preserving line breaks
      const strippedContent = rawContent
        .replace(/<(p|br|div|li)[^>]*>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      const description = strippedContent
        .replace(/\s+submitted by\s+\/u\/\S+[\s\S]*$/i, '')
        .trim();
      const text = description && !/^\[?(link|comments)\]?$/i.test(description) ? description : title;
      
      const id = atomText(entry, "id").trim().replace(/^t3_/, "");
      if (!text && !id && contentMedia.length === 0) continue;
      const authorName = cleanAtomContent(atomText(entry, "name")).replace(/^\/u\//i, "").trim() || "Reddit";
      const postUrl = atomAttribute(entry, "link", "href");
      const published = atomText(entry, "published").trim() || atomText(entry, "updated").trim();
      
      // Combine RSS media with extracted HTML media
      const rssMedia = [
        atomAttribute(entry, "media:content", "url"),
        atomAttribute(entry, "media:thumbnail", "url"),
        atomAttribute(entry, "enclosure", "url"),
      ].filter(v => /^https?:\/\//i.test(v)).map(url => ({ type: 'image' as const, url }));
      
      // Deduplicate (normalize URLs: decode entities, strip tracking params)
      const normalizeUrl = (u: string) => u
        .replace(/&amp;/g, '&')
        .replace(/&utm_[^&]+/g, '')
        .replace(/\?+$/, '');
      
      const allMedia = [...contentMedia, ...rssMedia]
        .filter((m, i, arr) => arr.findIndex(x => normalizeUrl(x.url) === normalizeUrl(m.url)) === i);
      
      // Post URL itself might be an image
      if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(postUrl) && !allMedia.some(m => normalizeUrl(m.url) === normalizeUrl(postUrl))) {
        allMedia.push({ type: 'image', url: postUrl });
      }
      
      records.push({
        platform: "reddit",
        account: {
          username: slug,
          displayName: isUser ? `u/${slug}` : `r/${slug}`,
        },
        post: {
          id: id || `rss_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          url: postUrl || "https://www.reddit.com",
          text,
          publishedAt: published && !Number.isNaN(new Date(published).getTime()) ? new Date(published).toISOString() : undefined,
          media: allMedia,
        },
        metrics: { likes: 0, comments: 0, shares: 0, views: 0 },
        monitorId: monitor.id,
      });
    }
  }
  return records;
}

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

function cleanAtomContent(value: string): string {
  const decode = (v: string) => v
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  let decoded = value;
  try { decoded = JSON.parse(`"${value}"`); } catch { /* keep */ }
  return decode(decode(decoded));
}

function atomText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ?? '';
}

function atomAttribute(block: string, tag: string, attribute: string): string {
  const element = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))?.[0] ?? '';
  const match = element.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] ?? '';
}
