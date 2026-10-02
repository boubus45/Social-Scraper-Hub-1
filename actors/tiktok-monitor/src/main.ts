import { Actor } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  accounts: string[];
  maxPostsPerAccount?: number;
  onlyNew?: boolean;
  monitorId: string;
}

interface TikTokRecord {
  platform: "tiktok";
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

interface TikTokVideo {
  playAddr?: string;
  downloadAddr?: string;
}

interface TikTokAuthor {
  uniqueId?: string;
  nickname?: string;
  id?: string;
  uid?: string;
}

interface TikTokStatistics {
  diggCount?: number;
  likeCount?: number;
  likes?: number;
  commentCount?: number;
  comments?: number;
  shareCount?: number;
  shares?: number;
  playCount?: number;
  views?: number;
}

interface TikTokNode {
  id?: string;
  aweme_id?: string;
  item_id?: string;
  desc?: string;
  text?: string;
  caption?: string;
  createTime?: number;
  create_time?: number;
  video?: TikTokVideo;
  video_url?: string;
  images?: string[];
  cover?: string;
  dynamicCover?: string;
  thumbnail?: string;
  author?: TikTokAuthor;
  statistics?: TikTokStatistics;
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
  if (object.itemList && Array.isArray(object.itemList)) return undefined;
  for (const child of Object.values(object)) {
    const found = findUserPayload(child);
    if (found) return found;
  }
  return undefined;
}

function collectMedia(node: TikTokNode): Array<{ type: "image" | "video"; url: string }> {
  const media: Array<{ type: "image" | "video"; url: string }> = [];
  
  const videoUrl = node.video?.playAddr ?? node.video?.downloadAddr ?? node.video_url;
  if (typeof videoUrl === "string" && videoUrl.startsWith("http")) {
    media.push({ type: "video", url: videoUrl });
  }
  
  if (Array.isArray(node.images)) {
    for (const img of node.images) {
      if (typeof img === "string" && img.startsWith("http")) {
        media.push({ type: "image", url: img });
      }
    }
  }
  
  const cover = node.cover ?? node.dynamicCover ?? node.thumbnail;
  if (typeof cover === "string" && cover.startsWith("http")) {
    media.push({ type: "image", url: cover });
  }
  
  return media;
}

function collectNodes(value: unknown, output: TikTokNode[] = []): TikTokNode[] {
  if (!value || typeof value !== "object") return output;
  const object = value as Record<string, unknown>;
  if (typeof object.id === "string" && (typeof object.aweme_id === "string" || typeof object.item_id === "string")) {
    output.push(object as TikTokNode);
  }
  for (const child of Object.values(object)) collectNodes(child, output);
  return output;
}

function nodeRichness(node: TikTokNode): number {
  let score = 0;
  if (node.desc || node.text || node.caption) score += 4;
  if (node.video || node.images || node.cover) score += 2;
  return score;
}

interface RequestHandlerContext {
  page: any;
  request: any;
  log: any;
}

async function runTikTok(input: Input): Promise<void> {
  const accounts = [...new Set((input.accounts ?? []).map(normalizeUsername))]
    .filter((account) => /^[a-zA-Z0-9._]{1,24}$/.test(account))
    .slice(0, MAX_ACCOUNTS);
  const maxPosts = Math.min(Math.max(input.maxPostsPerAccount ?? 2, 1), MAX_POSTS);
  if (accounts.length === 0) throw new Error("No valid TikTok accounts were supplied.");

  const stateStore = await Actor.openKeyValueStore(`tiktok-monitor-${input.monitorId}`);
  const state = ((await stateStore.getValue<{ seenPostIds?: string[] }>("STATE")) ?? { seenPostIds: [] });
  const seen = new Set(state.seenPostIds ?? []);
  const found: TikTokRecord[] = [];

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: accounts.length,
    requestHandlerTimeoutSecs: 90,
    maxConcurrency: 2,
    requestHandler: async ({ page, request, log }: RequestHandlerContext) => {
      const username = request.userData.username as string;
      await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(2000);

      const scripts = await page.locator("script").allTextContents();
      const payloads = readJsonScripts(scripts);
      const user = payloads.map(findUserPayload).find(Boolean);
      
      let nodes: TikTokNode[] = [];
      for (const payload of payloads) {
        if (payload && typeof payload === "object") {
          const obj = payload as Record<string, unknown>;
          if (obj.itemList && Array.isArray(obj.itemList)) {
            nodes.push(...obj.itemList.filter((item): item is TikTokNode => 
              typeof item === "object" && item !== null
            ));
          }
        }
      }
      
      if (nodes.length === 0) {
        nodes = payloads.flatMap((payload) => collectNodes(payload));
      }

      if (nodes.length === 0) {
        log.info(`Profile payload unavailable for ${username}; trying embed page.`);
        await page.goto(`https://www.tiktok.com/@${username}`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await sleep(1500);
        const embedScripts = await page.locator("script").allTextContents();
        const embedPayloads = readJsonScripts(embedScripts);
        for (const payload of embedPayloads) {
          if (payload && typeof payload === "object") {
            const obj = payload as Record<string, unknown>;
            if (obj.itemList && Array.isArray(obj.itemList)) {
              nodes.push(...obj.itemList.filter((item): item is TikTokNode => 
                typeof item === "object" && item !== null
              ));
            }
          }
        }
        if (nodes.length === 0) {
          nodes = embedPayloads.flatMap((payload) => collectNodes(payload));
        }
      }

      const uniqueNodes = [...nodes.reduce((byId, node) => {
        const id = String(node.id ?? node.aweme_id ?? node.item_id);
        const previous = byId.get(id);
        if (!previous || nodeRichness(node) > nodeRichness(previous)) byId.set(id, node);
        return byId;
      }, new Map<string, TikTokNode>()).values()];
      const selected = uniqueNodes.slice(0, maxPosts);

      for (const node of selected) {
        const id = String(node.id ?? node.aweme_id ?? node.item_id);
        if (input.onlyNew !== false && seen.has(id)) continue;
        
        const awemeId = String(node.aweme_id ?? node.item_id ?? id);
        const desc = typeof node.desc === "string" ? node.desc :
                     typeof node.text === "string" ? node.text :
                     typeof node.caption === "string" ? node.caption : "";
        
        const createTime = typeof node.createTime === "number" ? node.createTime :
                           typeof node.create_time === "number" ? node.create_time : undefined;
        const publishedAt = createTime ? new Date(createTime * 1000).toISOString() : undefined;
        
        const author = node.author?.uniqueId ?? node.author?.nickname ?? username;
        const authorId = node.author?.id ?? node.author?.uid;

        const stats = node.statistics;
        const likes = safeNumber(stats?.diggCount ?? stats?.likeCount ?? stats?.likes);
        const comments = safeNumber(stats?.commentCount ?? stats?.comments);
        const shares = safeNumber(stats?.shareCount ?? stats?.shares);
        const views = safeNumber(stats?.playCount ?? stats?.views);

        found.push({
          platform: "tiktok",
          account: {
            username,
            displayName: node.author?.nickname,
            id: authorId,
          },
          post: {
            id,
            url: `https://www.tiktok.com/@${username}/video/${awemeId}`,
            text: desc,
            publishedAt,
            media: collectMedia(node),
          },
          metrics: { likes, comments, shares, views },
          monitorId: input.monitorId,
        });
        seen.add(id);
      }
      log.info(`Collected ${found.length} new records while processing ${username}.`);
    },
    failedRequestHandler: async ({ request, log }: RequestHandlerContext) => {
      log.error(`TikTok request failed: ${request.url}`);
    },
  });

  await crawler.run(accounts.map((username) => ({
    url: `https://www.tiktok.com/@${username}`,
    userData: { username },
  })));

  await stateStore.setValue("STATE", {
    seenPostIds: [...seen].slice(-1000),
    updatedAt: new Date().toISOString(),
  });
  for (const record of found) await Actor.pushData(record);
  await Actor.setValue("SUMMARY", { monitorId: input.monitorId, accounts, returned: found.length });
  await Actor.exit();
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? { accounts: [], monitorId: "missing" };
await runTikTok(input);