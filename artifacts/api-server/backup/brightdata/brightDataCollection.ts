// Bright Data collection manager
// Centralized system for Bright Data sourced platforms:
// - Instagram, LinkedIn, TikTok, Facebook: marketplace datasets via /datasets/v3/trigger
// - X: a Scraper Studio scraper (c_…) — its datasets only accept single status URLs
// - Reddit: Apify actor (no Bright Data dataset exists)
// Collection runs hourly and on demand; the webhook route feeds the same store
// with deduplication.

import { getDatasetForPlatform, type PlatformDataset, type PlatformId } from './brightDataDatasets.ts';
import { normalizeFeedRecords, type NormalizedPost } from './brightDataNormalize.ts';
import { isConfigured, parseDatasetPayload, request } from './brightDataHttp.ts';
import { createStateStore, type PersistedState, type StateStore } from './brightDataStore.ts';

export type { NormalizedPost };

export interface CollectionSource {
  id: string;
  platform: PlatformId;
  username: string;
  datasetId: string;
  canonicalUrl: string;
  status: 'active' | 'paused' | 'error';
  lastCollectedAt?: string;
  lastPostId?: string;
  subscriberCount: number;
  createdAt: string;
  collectorId?: string;
}

export interface CollectionResult {
  sourceId: string;
  posts: NormalizedPost[];
  /** How many of those were new — the feed dedups, so raw ≠ stored. */
  added: number;
}

// ─── Configuration ──────────────────────────────────────────────────────

const COLLECTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export { COLLECTION_INTERVAL_MS };
// Restarts happen on every host that sleeps (free tiers do). Without a
// catch-up pass a woken process would idle for a whole interval before
// collecting anything, so the first pass runs shortly after boot instead.
const BOOT_CATCHUP_DELAY_MS = 15 * 1000;
const SAVE_DEBOUNCE_MS = 1000;
// Bounds both memory and the persisted state; the feed only ever reads the
// newest posts anyway.
const MAX_POSTS_PER_SOURCE = 200;

// ─── State ──────────────────────────────────────────────────────────────

const sources = new Map<string, CollectionSource>();
const posts = new Map<string, NormalizedPost[]>(); // sourceId -> posts
const subscriptions = new Map<string, { userId: string; sourceId: string }>();
let collectionTimer: NodeJS.Timeout | undefined;

// Persistence: Postgres when DATABASE_URL is set, otherwise a JSON snapshot.
// Undefined until init runs, which also keeps tests (never initialised) working.
let store: StateStore | undefined;
// Set when the very first load fails (database briefly unreachable). Writing
// our empty in-memory state back would erase a healthy database, so once this
// is set persistence stays off for the life of the process.
let persistenceBlocked = false;
let initPromise: Promise<void> | undefined;
let saveTimer: NodeJS.Timeout | undefined;

/**
 * Restores persisted state and starts the hourly loop. Idempotent: callers may
 * race it (startup awaits it, routes fire and forget).
 */
export function initBrightDataCollection(): Promise<void> {
  initPromise ??= bootstrap();
  return initPromise;
}

async function bootstrap(): Promise<void> {
  store = createStateStore();

  try {
    const state = await store.load();
    if (state) applyState(state);
    console.log(
      `[BrightData] State restored from ${store.label}: ` +
        `${sources.size} sources, ${[...posts.values()].reduce((n, list) => n + list.length, 0)} posts`,
    );
  } catch (error) {
    // Losing persisted state must not stop the server from serving what it has.
    console.error('[BrightData] Failed to load persisted state:', error);
    // …but the reverse must not happen either: an empty process flushing on
    // shutdown would wipe rows it never managed to read.
    persistenceBlocked = true;
    console.error(
      '[BrightData] Persistence disabled for this run: writing now would replace ' +
        'a healthy database with an empty state. Fix the connection and restart.',
    );
  }

  if (isConfigured()) {
    console.log('[BrightData] Collection manager initialized');
    startCollectionLoop();
    // Collect whatever is due as soon as the process is up: sources gathered
    // less than an interval ago are skipped by isSourceDue, so this never
    // double-pays for a scrape.
    const catchUp = setTimeout(() => { void runScheduledCollections(); }, BOOT_CATCHUP_DELAY_MS);
    catchUp.unref?.();
  } else {
    console.warn('[BrightData] BRIGHTDATA_API_TOKEN not set — collection disabled');
  }
}

function applyState(state: PersistedState): void {
  sources.clear();
  posts.clear();
  subscriptions.clear();

  for (const source of state.sources) sources.set(source.id, source);
  for (const [sourceId, collected] of Object.entries(state.posts)) {
    // Rows for sources that no longer exist would be unreachable anyway.
    if (sources.has(sourceId)) posts.set(sourceId, collected.slice(0, MAX_POSTS_PER_SOURCE));
  }
  for (const subscription of state.subscriptions) {
    if (sources.has(subscription.sourceId)) {
      subscriptions.set(`${subscription.userId}:${subscription.sourceId}`, subscription);
    }
  }
}

function snapshotState(): PersistedState {
  const postsBySource: PersistedState['posts'] = {};
  for (const [sourceId, collected] of posts) postsBySource[sourceId] = collected;

  return {
    sources: [...sources.values()],
    posts: postsBySource,
    subscriptions: [...subscriptions.values()],
  };
}

/** Debounced write; every mutation funnels through here. */
function scheduleSave(): void {
  if (!store || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void flushState();
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** Writes pending state immediately (shutdown, tests, before reading the feed). */
export async function flushState(): Promise<void> {
  if (!store) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (persistenceBlocked) {
    console.warn(
      '[BrightData] Skipping write: the initial load failed, so this process never ' +
        'saw what is already stored. Writing would erase it.',
    );
    return;
  }
  try {
    await store.save(snapshotState());
  } catch (error) {
    console.error('[BrightData] Failed to persist state:', error);
  }
}

/** Flushes pending writes and releases the database connection. */
export async function shutdownBrightDataCollection(): Promise<void> {
  stopCollectionLoop();
  await flushState();
  const closing = store;
  store = undefined;
  initPromise = undefined;
  await closing?.close();
}

// ─── Subscription Management ──────────────────────────────────────────

export function subscribeToSource(userId: string, platform: PlatformId, username: string): CollectionSource {
  const dataset = getDatasetForPlatform(platform);
  if (!dataset) {
    throw new Error(`No Bright Data dataset for platform: ${platform}`);
  }

  let source = [...sources.values()].find(
    s => s.platform === platform && s.username.toLowerCase() === username.toLowerCase()
  );

  if (!source) {
    const id = `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    source = {
      id,
      platform,
      username,
      datasetId: dataset.id,
      canonicalUrl: dataset.urlTemplate.replace('{username}', username),
      status: 'active',
      subscriberCount: 0,
      createdAt: new Date().toISOString(),
    };
    sources.set(id, source);
    posts.set(id, []);
    console.log(`[BrightData] Created source: ${platform}/${username} (${dataset.id})`);
  }

  const existing = [...subscriptions.values()].find(
    s => s.userId === userId && s.sourceId === source!.id
  );
  if (existing) return source;

  subscriptions.set(`${userId}:${source.id}`, { userId, sourceId: source.id });
  source.subscriberCount++;
  sources.set(source.id, source);
  scheduleSave();
  console.log(`[BrightData] User ${userId} subscribed to ${platform}/${username} (${source.subscriberCount} subscribers)`);

  return source;
}

export function unsubscribeFromSource(userId: string, platform: PlatformId, username: string): boolean {
  const source = [...sources.values()].find(
    s => s.platform === platform && s.username.toLowerCase() === username.toLowerCase()
  );
  if (!source) return false;

  const key = `${userId}:${source.id}`;
  if (!subscriptions.has(key)) return false;

  subscriptions.delete(key);
  source.subscriberCount = Math.max(0, source.subscriberCount - 1);
  sources.set(source.id, source);

  if (source.subscriberCount === 0) {
    source.status = 'paused';
    sources.set(source.id, source);
    console.log(`[BrightData] Source ${platform}/${username} paused (no subscribers)`);
  }

  scheduleSave();
  return true;
}

export function getSubscribedSources(userId: string): CollectionSource[] {
  const userSubs = [...subscriptions.values()].filter(s => s.userId === userId);
  return userSubs.map(s => sources.get(s.sourceId)).filter(Boolean) as CollectionSource[];
}

export function getSource(id: string): CollectionSource | undefined {
  return sources.get(id);
}

export function getAllSources(): CollectionSource[] {
  return [...sources.values()];
}

// ─── Collection Loop ──────────────────────────────────────────────────

/**
 * A source should be collected when it never has been, or when its last
 * successful collection is at least one interval old. Restarting the process,
 * an on-demand run, or a webhook delivery all push `lastCollectedAt` forward,
 * so nothing pays twice for the same scrape.
 */
export function isSourceDue(source: CollectionSource, now = Date.now()): boolean {
  if (!source.lastCollectedAt) return true;
  const last = new Date(source.lastCollectedAt).getTime();
  if (Number.isNaN(last)) return true; // corrupt timestamp → better to try
  return now - last >= COLLECTION_INTERVAL_MS;
}

function startCollectionLoop(): void {
  if (collectionTimer) clearInterval(collectionTimer);
  collectionTimer = setInterval(() => {
    void runScheduledCollections();
  }, COLLECTION_INTERVAL_MS);
  console.log(`[BrightData] Collection loop started (${COLLECTION_INTERVAL_MS / 60000}min interval)`);
}

export function stopCollectionLoop(): void {
  if (collectionTimer) {
    clearInterval(collectionTimer);
    collectionTimer = undefined;
  }
}

async function runScheduledCollections(): Promise<void> {
  if (!isConfigured()) return;

  const now = Date.now();
  const activeSources = [...sources.values()].filter(
    s => s.status === 'active' && s.subscriberCount > 0
  );
  const dueSources = activeSources.filter(s => isSourceDue(s, now));

  console.log(
    `[BrightData] Running scheduled collection for ${dueSources.length}/${activeSources.length} sources`,
  );

  for (const source of dueSources) {
    try {
      await collectFromSource(source);
    } catch (err) {
      console.error(`[BrightData] Failed to collect ${source.platform}/${source.username}: ${err}`);
    }
  }
}

export async function collectFromSource(source: CollectionSource): Promise<CollectionResult> {
  const dataset = getDatasetForPlatform(source.platform);
  if (!dataset) {
    throw new Error(`No dataset for ${source.platform}`);
  }

  console.log(`[BrightData] Collecting ${source.platform}/${source.username} from ${dataset.id}`);

  // Scraper Studio scrapers (c_…) are used for platforms whose marketplace
  // dataset refuses /trigger — X, for example, only exposes per-status URLs.
  if (dataset.scraperId) {
    return collectViaScraper(source, dataset);
  }

  if (dataset.supportsOnDemand) {
    return collectOnDemand(source, dataset);
  }

  throw new Error(`No on-demand collection path configured for ${source.platform}`);
}

/** Normalizes, deduplicates and stores a fresh batch, then stamps the source. */
function storeCollected(
  source: CollectionSource,
  records: unknown[],
): { posts: NormalizedPost[]; added: number } {
  const normalizedPosts = normalizeFeedRecords(source.platform, records, source.username);
  const existing = posts.get(source.id) ?? [];

  const merged = deduplicatePosts([...existing, ...normalizedPosts]);
  // Bright Data paginates profiles, so the same post arrives several times:
  // count what actually grew rather than what was normalized.
  const added = Math.max(0, Math.min(merged.length, MAX_POSTS_PER_SOURCE) - existing.length);
  // Newest first, then capped: Bright Data occasionally returns undated records
  // and they would otherwise push real posts out at random.
  merged.sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());
  posts.set(source.id, merged.slice(0, MAX_POSTS_PER_SOURCE));

  source.lastCollectedAt = new Date().toISOString();
  if (normalizedPosts.length > 0) {
    source.lastPostId = normalizedPosts[0].platformPostId;
  }
  sources.set(source.id, source);
  scheduleSave();

  return { posts: normalizedPosts, added };
}

async function collectOnDemand(source: CollectionSource, dataset: PlatformDataset): Promise<CollectionResult> {
  // Trigger async collection with webhook delivery; the snapshot poll below is
  // the reliable path, the webhook is a bonus once the URL is publicly routed.
  const webhookUrl = getWebhookUrl(dataset.id, source.id);
  const triggerRes = await request(
    `/datasets/v3/trigger?dataset_id=${dataset.id}&format=json&endpoint=${encodeURIComponent(webhookUrl)}`,
    {
      method: 'POST',
      body: JSON.stringify([{ url: source.canonicalUrl }]),
    }
  );

  if (!triggerRes.ok) {
    const detail = await triggerRes.text().catch(() => '');
    throw new Error(`Trigger failed: ${triggerRes.status} ${triggerRes.statusText} ${detail}`.trim());
  }

  const { snapshot_id } = (await triggerRes.json()) as { snapshot_id: string };
  console.log(`[BrightData] Triggered ${source.platform}/${source.username}, snapshot: ${snapshot_id}`);

  const data = await waitForSnapshot(snapshot_id);
  const { posts, added } = storeCollected(source, data);
  return { sourceId: source.id, posts, added };
}

/**
 * Runs a Scraper Studio scraper for one source: POST /dca/trigger starts the
 * job (the returned collection_id is what other endpoints call snapshot_id) and
 * GET /dca/dataset returns the rows once they are ready.
 *
 * queue_next is deliberately omitted: trial collectors reject queued jobs.
 */
async function collectViaScraper(source: CollectionSource, dataset: PlatformDataset): Promise<CollectionResult> {
  const scraperId = dataset.scraperId!;

  const triggerRes = await request(
    `/dca/trigger?collector=${scraperId}`,
    {
      method: 'POST',
      body: JSON.stringify([{ url: source.canonicalUrl }]),
    },
  );

  if (!triggerRes.ok) {
    const detail = await triggerRes.text().catch(() => '');
    throw new Error(`Scraper trigger failed: ${triggerRes.status} ${detail}`.trim());
  }

  const { collection_id, snapshot_id } = (await triggerRes.json()) as {
    collection_id?: string;
    snapshot_id?: string;
  };
  const jobId = collection_id ?? snapshot_id;
  if (!jobId) throw new Error('Scraper trigger returned no collection id');

  console.log(`[BrightData] Scraper ${scraperId} running for ${source.platform}/${source.username}, job: ${jobId}`);

  const data = await waitForDcaDataset(jobId);
  const { posts, added } = storeCollected(source, data);
  return { sourceId: source.id, posts, added };
}

async function waitForDcaDataset(collectionId: string, timeoutMs = 180000): Promise<unknown[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(`/dca/dataset?id=${collectionId}`);

    if (res.ok) {
      // Ready rows arrive as concatenated JSON documents; a running job answers
      // {"status":"collecting"} which parses to an empty array.
      const records = parseDatasetPayload(await res.text());
      if (records.length > 0) return records;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Collection ${collectionId} not ready after ${timeoutMs}ms`);
}

async function waitForSnapshot(snapshotId: string, timeoutMs = 180000): Promise<unknown[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(`/datasets/v3/snapshot/${snapshotId}?format=json`);

    if (res.ok) {
      const body = await res.text();
      const records = parseDatasetPayload(body);
      if (records.length > 0) return records;
      // An empty result set never becomes non-empty: stop as soon as Bright Data
      // reports the snapshot ready rather than polling to the timeout.
      if (/"status"\s*:\s*"ready"/.test(body)) return [];
    }

    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error(`Snapshot ${snapshotId} not ready after ${timeoutMs}ms`);
}

// ─── Deduplication ─────────────────────────────────────────────────────

function deduplicatePosts(posts: NormalizedPost[]): NormalizedPost[] {
  const seen = new Set<string>();
  return posts.filter(p => {
    const key = `${p.platform}:${p.platformPostId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getWebhookUrl(datasetId?: string, sourceId?: string): string {
  const base =
    process.env.BRIGHTDATA_WEBHOOK_URL ?? "https://your-domain.com/api/webhooks/brightdata";
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }
  // Bright Data appends nothing by itself, so we tag the delivery URL: source_id
  // attributes the batch to one source, dataset_id disambiguates shared datasets,
  // and secret authenticates the caller.
  if (sourceId) url.searchParams.set("source_id", sourceId);
  if (datasetId) url.searchParams.set("dataset_id", datasetId);
  const secret = process.env.BRIGHTDATA_WEBHOOK_SECRET;
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

// ─── Webhook Ingestion ────────────────────────────────────────────────

export interface WebhookMatchOptions {
  /** Passed by our own triggers (source_id query param on the delivery URL). */
  sourceId?: string;
  /** Passed by our own triggers; useless on its own when sources share a dataset. */
  datasetId?: string;
}

export async function ingestWebhookPayload(
  payload: any[],
  options: WebhookMatchOptions = {},
): Promise<{ ingested: number; duplicates: number; skipped: number; errors: number }> {
  let ingested = 0;
  let duplicates = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of payload) {
    try {
      const source = findSourceForItem(item, options);
      if (!source) {
        console.warn(`[BrightData] No source found for webhook item: ${JSON.stringify(item).slice(0, 80)}`);
        errors++;
        continue;
      }

      // Same normalizer as the snapshot path: it flattens profile records and
      // applies the per-platform field names.
      const [normalized] = normalizeFeedRecords(source.platform, [item], source.username);
      if (!normalized) {
        // {"posts":[]} means the input had nothing to return — not a failure.
        if (item && typeof item === "object" && Array.isArray((item as { posts?: unknown }).posts)) {
          skipped++;
          continue;
        }
        console.warn(`[BrightData] Webhook item has neither id nor url: ${JSON.stringify(item).slice(0, 80)}`);
        errors++;
        continue;
      }
      const { platformPostId, url } = normalized;
      const existingPosts = posts.get(source.id) ?? [];

      // Dedup by platformPostId
      if (existingPosts.some(p => p.platformPostId === platformPostId)) {
        duplicates++;
        continue;
      }

      // Dedup by URL
      if (url && existingPosts.some(p => p.url === url)) {
        duplicates++;
        continue;
      }

      // Only ingest if newer
      if (source.lastPostId && normalized.publishedAt) {
        const lastPost = existingPosts.find(p => p.platformPostId === source.lastPostId);
        if (lastPost?.publishedAt && new Date(normalized.publishedAt) <= new Date(lastPost.publishedAt)) {
          duplicates++;
          continue;
        }
      }

      existingPosts.push(normalized);
      posts.set(source.id, existingPosts);

      source.lastPostId = platformPostId;
      source.lastCollectedAt = new Date().toISOString();
      sources.set(source.id, source);

      ingested++;
    } catch (err) {
      console.error(`[BrightData] Error ingesting item: ${err}`);
      errors++;
    }
  }

  scheduleSave();
  return { ingested, duplicates, skipped, errors };
}

// Fields Bright Data echoes back for the input we triggered. Instagram post
// permalinks (/p/XYZ/) never contain the profile name, so the item URL alone is
// not enough to attribute a post to a source.
const INPUT_FIELDS = ["input_url", "source_url", "profile_url", "account", "username", "url"] as const;

function itemSourceHints(item: any): string[] {
  const hints: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) hints.push(value.trim().toLowerCase());
  };

  for (const field of INPUT_FIELDS) push(item?.[field]);

  const input = item?._input ?? item?.input;
  if (typeof input === "string") push(input);
  else if (input && typeof input === "object") {
    push((input as any).url);
    push((input as any).username);
  }

  return hints;
}

function hintMatchesSource(hint: string, source: CollectionSource): boolean {
  if (hint.includes(source.canonicalUrl.toLowerCase())) return true;
  const username = source.username.toLowerCase();
  if (username.length < 2) return false;
  return (
    hint === username ||
    hint.includes(`/${username}`) ||
    hint.includes(`@${username}`) ||
    hint.includes(`/${username}/`) ||
    hint.includes(`?username=${username}`)
  );
}

function findSourceForItem(item: any, options: WebhookMatchOptions): CollectionSource | undefined {
  // 1. Exact match: our triggers stamp source_id on the delivery URL.
  if (options.sourceId) {
    const source = sources.get(options.sourceId);
    if (source) return source;
    console.warn(`[BrightData] Webhook carried unknown source_id: ${options.sourceId}`);
  }

  // 2. Heuristic: any input/profile field pointing at this source's account.
  const hints = itemSourceHints(item);
  if (hints.length > 0) {
    const byHint = [...sources.values()].find(s => hints.some(h => hintMatchesSource(h, s)));
    if (byHint) return byHint;
  }

  // 3. Last resort: a dataset only identifies the source when it has one subscriber.
  if (options.datasetId) {
    const candidates = [...sources.values()].filter(s => s.datasetId === options.datasetId);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      console.warn(
        `[BrightData] ${candidates.length} sources share dataset ${options.datasetId} and no input field matched`,
      );
    }
  }

  return undefined;
}

// ─── Feed Retrieval ───────────────────────────────────────────────────

export function getUserFeed(userId: string): NormalizedPost[] {
  const userSubs = [...subscriptions.values()].filter(s => s.userId === userId);
  const allPosts: NormalizedPost[] = [];

  for (const sub of userSubs) {
    const sourcePosts = posts.get(sub.sourceId) ?? [];
    allPosts.push(...sourcePosts);
  }

  allPosts.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  return allPosts;
}

// Export state for routes
export { sources, posts, subscriptions };
