import { Actor } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  platform?: "instagram" | "reddit";
  accounts: string[];
  sources?: string[];
  limit?: number;
  maxPostsPerAccount?: number;
  onlyNew?: boolean;
  monitorId: string;
}

interface RedditListing {
  data?: { children?: Array<{ data?: Record<string, unknown> }> };
}

interface InstagramRecord {
  platform: "instagram";
  account: { username: string; displayName?: string; id?: string };
  post: {
    id: string;
    url: string;
    text: string;
    publishedAt?: string;
    media: Array<{ type: "image" | "video"; url: string }>;
  };
  metrics: { likes: number; comments: number; shares: number; views: number };
  monitorId: string;
}

const MAX_ACCOUNTS = 20;
const MAX_POSTS = 20;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function normalizeRedditSource(value: string): { slug: string; isUser: boolean } {
  const trimmed = value.trim().replace(/^r\//i, "");
  const isUser = trimmed.toLowerCase().startsWith("u/");
  return { slug: isUser ? trimmed.slice(2) : trimmed, isUser };
}

function redditMedia(post: Record<string, unknown>): Array<{ type: "image" | "video"; url: string }> {
  const media: Array<{ type: "image" | "video"; url: string }> = [];
  const url = typeof post.url === "string" ? post.url : "";
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) media.push({ type: "image", url });
  const secure = post.secure_media as { reddit_video?: { fallback_url?: string } } | undefined;
  const video = secure?.reddit_video?.fallback_url;
  if (video) media.push({ type: "video", url: video });
  return media;
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
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\s\\S]*?)<\/${tag}>`, 'i'));
  return match?.[1] ?? '';
}

function atomAttribute(block: string, tag: string, attribute: string): string {
  const element = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))?.[0] ?? '';
  const match = element.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] ?? '';
}

async function runReddit(input: Input): Promise<void> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const sources = [...new Set((input.sources ?? input.accounts ?? []).filter(source => typeof source === "string"))].slice(0, 10);
  for (const rawSource of sources) {
    const source = normalizeRedditSource(rawSource);
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(source.slug)) continue;
    const endpoint = source.isUser
      ? `https://www.reddit.com/user/${encodeURIComponent(source.slug)}/.rss?limit=${limit}`
      : `https://www.reddit.com/r/${encodeURIComponent(source.slug)}/.rss?limit=${limit}`;
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(endpoint, {
          headers: {
            Accept: "application/atom+xml, application/xml, text/xml",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
      } catch (fetchError) {
        console.error(`Reddit ${source.isUser ? `u/${source.slug}` : `r/${source.slug}`} fetch error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
        if (attempt === 2) continue;
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
        continue;
      }
      if (response.status === 429 && attempt < 2) {
        console.warn(`Reddit rate limited, retrying in ${(attempt + 1) * 2}s`);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
        continue;
      }
      break;
    }
    if (!response) {
      console.error(`Reddit ${source.isUser ? `u/${source.slug}` : `r/${source.slug}`}: no response after retries`);
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Reddit ${source.isUser ? `u/${source.slug}` : `r/${source.slug}`}: HTTP ${response.status} ${body.slice(0, 200)}`);
      continue;
    }
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
      
      await Actor.pushData({
        platform: "reddit",
        account: {
          username: source.slug,
          displayName: source.isUser ? `u/${source.slug}` : `r/${source.slug}`,
        },
        post: {
          id: id || `rss_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          url: postUrl || "https://www.reddit.com",
          text,
          publishedAt: published && !Number.isNaN(new Date(published).getTime()) ? new Date(published).toISOString() : undefined,
          media: [
            atomAttribute(entry, "media:content", "url"),
            atomAttribute(entry, "media:thumbnail", "url"),
            atomAttribute(entry, "enclosure", "url"),
          ].filter(v => /^https?:\/\//i.test(v)),
        },
        metrics: { likes: 0, comments: 0, shares: 0, views: 0 },
        monitorId: input.monitorId,
      });
    }
  }
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readJsonScripts(scripts: string[]): unknown[] {
  return scripts.flatMap((source) => {
    const trimmed = source.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  });
}

function findUserPayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.user && typeof object.user === "object") return object.user as Record<string, unknown>;
  if (object.owner && typeof object.owner === "object") return object.owner as Record<string, unknown>;
  for (const child of Object.values(object)) {
    const found = findUserPayload(child);
    if (found) return found;
  }
  return undefined;
}

function collectMedia(node: Record<string, unknown>): Array<{ type: "image" | "video"; url: string }> {
  const media: Array<{ type: "image" | "video"; url: string }> = [];
  const image = typeof node.display_url === "string" ? node.display_url : typeof node.thumbnail_src === "string" ? node.thumbnail_src : undefined;
  if (image) media.push({ type: "image", url: image });
  const video = typeof node.video_url === "string" ? node.video_url : undefined;
  if (video) media.push({ type: "video", url: video });
  if (node.is_video === true && !video && typeof node.video_src === "string") {
    media.push({ type: "video", url: node.video_src });
  }
  const children = (node.edge_sidecar_to_children as { edges?: Array<{ node?: Record<string, unknown> }> } | undefined)
    ?.edges?.map(edge => edge.node).filter((child): child is Record<string, unknown> => Boolean(child)) ?? [];
  for (const child of children) {
    for (const childMedia of collectMedia(child)) {
      if (!media.some(item => item.url === childMedia.url)) media.push(childMedia);
    }
  }
  return media;
}

function collectNodes(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return output;
  const object = value as Record<string, unknown>;
  if (typeof object.id === "string" && (typeof object.shortcode === "string" || typeof object.code === "string")) {
    output.push(object);
  }
  for (const child of Object.values(object)) collectNodes(child, output);
  return output;
}

function nodeRichness(node: Record<string, unknown>): number {
  let score = 0;
  if (node.edge_media_to_caption || node.caption || node.caption_text) score += 4;
  if (node.display_url || node.thumbnail_src || node.video_url) score += 2;
  if (node.edge_sidecar_to_children) score += 1;
  return score;
}

function unescapeJsonString(value: string): string {
  let decoded = value;
  try {
    decoded = JSON.parse(`"${value}"`) as string;
  } catch {
    // Some embed payloads contain JavaScript-style escapes that are not valid JSON.
  }
  return decoded
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\\\/g, "\\");
}

function collectEmbedNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const marker = /\\"shortcode_media\\":\{/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(html))) {
    const segment = html.slice(match.index, match.index + 12000);
    const readString = (key: string): string | undefined => {
      const value = segment.match(new RegExp(`\\\\\"${key}\\\\\":\\\\\"((?:\\\\\\\\.|[^\"\\\\])*)`))?.[1];
      return value ? unescapeJsonString(value) : undefined;
    };
    const id = readString("id");
    const shortcode = readString("shortcode");
    if (!id || !shortcode) continue;
    const node: Record<string, unknown> = { id, shortcode };
    const image = readString("display_url");
    const video = readString("video_url");
    const videoSrc = segment.match(/https?:\\\\\/\\\\\/[^" ]+?\.mp4[^" ]*/)?.[0];
    const caption = segment.match(
      /\\\"edge_media_to_caption\\\":\{\\\"edges\\\":\[\{\\\"node\\\":\{\\\"text\\\":\\\"((?:\\\\\\\\.|[^"\\\\])*)/,
    )?.[1];
    if (image) node.display_url = image;
    if (video) node.video_url = video;
    if (videoSrc) node.video_src = unescapeJsonString(videoSrc);
    if (caption) node.caption = unescapeJsonString(caption);
    const timestamp = segment.match(/\\\"taken_at_timestamp\\\":(\d+)/)?.[1];
    if (timestamp) node.taken_at_timestamp = Number(timestamp);
    const isVideo = segment.includes('\\"is_video\\":true');
    if (isVideo) node.is_video = true;
    nodes.push(node);
  }
  return nodes;
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? { accounts: [], monitorId: "missing" };
if (input.platform === "reddit") {
  await runReddit(input);
  await Actor.exit();
}
const accounts = [...new Set((input.accounts ?? []).map(normalizeUsername))]
  .filter((account) => /^[a-zA-Z0-9._]{1,30}$/.test(account))
  .slice(0, MAX_ACCOUNTS);
const maxPosts = Math.min(Math.max(input.maxPostsPerAccount ?? 2, 1), MAX_POSTS);
if (accounts.length === 0) throw new Error("No valid Instagram accounts were supplied.");

const stateStore = await Actor.openKeyValueStore(`instagram-monitor-${input.monitorId}`);
const state = ((await stateStore.getValue<{ seenPostIds?: string[] }>("STATE")) ?? { seenPostIds: [] });
const seen = new Set(state.seenPostIds ?? []);
const found: InstagramRecord[] = [];
const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: accounts.length,
  requestHandlerTimeoutSecs: 90,
  maxConcurrency: 2,
  requestHandler: async ({ page, request, log }) => {
    const username = request.userData.username as string;
    await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1500);

    const scripts = await page.locator("script").allTextContents();
    const payloads = readJsonScripts(scripts);
    const user = payloads.map(findUserPayload).find(Boolean);
    let videoSources: string[] = [];
    let nodes = payloads.flatMap((payload) => collectNodes(payload));
    if (nodes.length === 0) {
      log.info(`Profile payload unavailable for ${username}; trying the public profile embed.`);
      await page.goto(`https://www.instagram.com/${username}/embed/`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      nodes = collectEmbedNodes(await page.content());
    }
    videoSources = await page.locator("video").evaluateAll(elements =>
      elements
        .map(element => {
          const video = element as HTMLVideoElement;
          return video.currentSrc || video.getAttribute("src") || "";
        })
        .filter(Boolean),
    );
    const uniqueNodes = [...nodes.reduce((byId, node) => {
      const id = String(node.id);
      const previous = byId.get(id);
      if (!previous || nodeRichness(node) > nodeRichness(previous)) byId.set(id, node);
      return byId;
    }, new Map<string, Record<string, unknown>>()).values()];
    const selected = uniqueNodes.slice(0, maxPosts);

    for (const [index, node] of selected.entries()) {
      const id = String(node.id);
      if (input.onlyNew !== false && seen.has(id)) continue;
      if (node.is_video === true && !node.video_url && videoSources[index]) {
        node.video_src = videoSources[index];
      }
      const shortcode = String(node.shortcode ?? node.code);
      if (node.is_video === true && !node.video_url && !node.video_src) {
        await page.goto(`https://www.instagram.com/p/${shortcode}/embed/`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await sleep(1000);
        const postVideoSources = await page.locator("video").evaluateAll(elements =>
          elements
            .map(element => {
              const video = element as HTMLVideoElement;
              return video.currentSrc || video.getAttribute("src") || "";
            })
            .filter(Boolean),
        );
        if (postVideoSources[0]) node.video_src = postVideoSources[0];
      }
      const captionObject = node.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> } | undefined;
      const captionText = typeof node.caption === "object" && node.caption !== null
        ? (node.caption as { text?: string }).text
        : undefined;
      const text = captionObject?.edges?.[0]?.node?.text
        ?? captionText
        ?? (typeof node.caption === "string" ? node.caption : undefined)
        ?? (typeof node.caption_text === "string" ? node.caption_text : "")
        ?? (typeof node.accessibility_caption === "string" ? node.accessibility_caption : "");
      const publishedAt = typeof node.taken_at_timestamp === "number"
        ? new Date(node.taken_at_timestamp * 1000).toISOString()
        : undefined;
      found.push({
        platform: "instagram",
        account: {
          username,
          displayName: typeof user?.full_name === "string" ? user.full_name : undefined,
          id: typeof user?.id === "string" ? user.id : undefined,
        },
        post: {
          id,
          url: `https://www.instagram.com/p/${shortcode}/`,
          text,
          publishedAt,
          media: collectMedia(node),
        },
        metrics: {
          likes: safeNumber((node.edge_media_preview_like as { count?: number } | undefined)?.count),
          comments: safeNumber((node.edge_media_to_comment as { count?: number } | undefined)?.count),
          shares: 0,
          views: safeNumber(node.video_view_count),
        },
        monitorId: input.monitorId,
      });
      seen.add(id);
    }
    log.info(`Collected ${found.length} new records while processing ${username}.`);
  },
  failedRequestHandler: async ({ request, log }) => {
    log.error(`Instagram request failed: ${request.url}`);
  },
});

await crawler.run(accounts.map((username) => ({
  url: `https://www.instagram.com/${username}/`,
  userData: { username },
})));

await stateStore.setValue("STATE", {
  seenPostIds: [...seen].slice(-1000),
  updatedAt: new Date().toISOString(),
});
for (const record of found) await Actor.pushData(record);
await Actor.setValue("SUMMARY", { monitorId: input.monitorId, accounts, returned: found.length });
await Actor.exit();
