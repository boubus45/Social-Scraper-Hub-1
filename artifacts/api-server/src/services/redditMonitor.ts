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

export async function startRedditRun(monitor: RedditMonitor) {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_SOCIAL_MONITOR_ACTOR_ID;
  if (!token || !actorId) throw new Error("APIFY_API_TOKEN and APIFY_SOCIAL_MONITOR_ACTOR_ID must be configured.");
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
