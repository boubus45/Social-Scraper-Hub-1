import { Actor } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  accounts: string[];
  maxPostsPerAccount?: number;
  onlyNew?: boolean;
  monitorId: string;
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

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\\//g, "/")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\\\/g, "\\");
  }
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
    if (image) node.display_url = image;
    if (video) node.video_url = video;
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
    let nodes = payloads.flatMap((payload) => collectNodes(payload));
    if (nodes.length === 0) {
      log.info(`Profile payload unavailable for ${username}; trying the public profile embed.`);
      await page.goto(`https://www.instagram.com/${username}/embed/`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      nodes = collectEmbedNodes(await page.content());
    }
    const uniqueNodes = [...new Map(nodes.map((node) => [String(node.id), node])).values()];
    const selected = uniqueNodes.slice(0, maxPosts);

    for (const node of selected) {
      const id = String(node.id);
      if (input.onlyNew !== false && seen.has(id)) continue;
      const shortcode = String(node.shortcode ?? node.code);
      const captionObject = node.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> } | undefined;
      const text = captionObject?.edges?.[0]?.node?.text ?? (typeof node.caption === "string" ? node.caption : "");
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
