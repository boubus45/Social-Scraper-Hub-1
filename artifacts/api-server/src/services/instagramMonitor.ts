import crypto from "node:crypto";

export type InstagramPlan = "free" | "pro" | "mega" | "admin";
export type InstagramFrequency = "1h" | "3h" | "6h" | "daily";

export interface InstagramMonitor {
  id: string;
  userId: string;
  platform: "instagram";
  accounts: string[];
  plan: InstagramPlan;
  frequency: InstagramFrequency;
  maxPostsPerAccount: number;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  apifyRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramPostRecord {
  platform: "instagram";
  account: {
    username: string;
    displayName?: string;
    id?: string;
  };
  post: {
    id: string;
    url: string;
    text: string;
    publishedAt?: string;
    media: Array<{ type: "image" | "video"; url: string }>;
  };
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  monitorId?: string;
}

const PLAN_LIMITS: Record<
  InstagramPlan,
  { accounts: number; frequencies: InstagramFrequency[]; maxPosts: number }
> = {
  free: { accounts: 3, frequencies: ["daily"], maxPosts: 2 },
  pro: { accounts: 10, frequencies: ["6h", "daily"], maxPosts: 10 },
  mega: { accounts: 20, frequencies: ["1h", "3h", "6h", "daily"], maxPosts: 20 },
  // Owner account: no cap on accounts, every cadence allowed.
  admin: { accounts: Infinity, frequencies: ["1h", "3h", "6h", "daily"], maxPosts: 50 },
};

/** Account tier (from the signed-in user) → this service's plan vocabulary. */
export function planForTier(tier: string | undefined): InstagramPlan {
  if (tier === "admin") return "admin";
  if (tier === "pro") return "pro";
  if (tier === "mega-pro") return "mega";
  return "free";
}

const monitors = new Map<string, InstagramMonitor>();
const feed = new Map<string, InstagramPostRecord[]>();

export function getPlanLimits(plan: InstagramPlan) {
  return PLAN_LIMITS[plan];
}

export function validateMonitorInput(input: unknown): Omit<InstagramMonitor, "id" | "createdAt" | "updatedAt"> {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be an object.");
  }

  const body = input as Record<string, unknown>;
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "local-user";
  const plan =
    body.plan === "pro" || body.plan === "mega" || body.plan === "admin"
      ? body.plan
      : "free";
  const frequency = body.frequency;
  const accounts = Array.isArray(body.accounts)
    ? [...new Set(body.accounts.filter((account): account is string => typeof account === "string").map(normalizeUsername))]
    : [];
  const limits = PLAN_LIMITS[plan];

  if (accounts.length === 0) throw new Error("At least one Instagram username is required.");
  if (accounts.some(account => !/^[a-zA-Z0-9._]{1,30}$/.test(account))) {
    throw new Error("Instagram usernames may contain letters, numbers, periods, and underscores.");
  }
  if (accounts.length > limits.accounts) {
    throw new Error(`${plan} users can monitor up to ${limits.accounts} Instagram accounts.`);
  }
  if (typeof frequency !== "string" || !limits.frequencies.includes(frequency as InstagramFrequency)) {
    throw new Error(`${plan} users may use: ${limits.frequencies.join(", ")}.`);
  }

  return {
    userId,
    platform: "instagram",
    accounts,
    plan,
    frequency: frequency as InstagramFrequency,
    maxPostsPerAccount: limits.maxPosts,
    enabled: body.enabled !== false,
  };
}

export function createMonitor(input: unknown): InstagramMonitor {
  const now = new Date().toISOString();
  const monitor: InstagramMonitor = {
    ...validateMonitorInput(input),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  monitors.set(monitor.id, monitor);
  feed.set(monitor.id, feed.get(monitor.id) ?? []);
  return monitor;
}

export function getMonitor(id: string): InstagramMonitor | undefined {
  return monitors.get(id);
}

export function getMonitorByRunId(runId: string): InstagramMonitor | undefined {
  return [...monitors.values()].find(monitor => monitor.apifyRunId === runId);
}

export function updateMonitor(id: string, input: unknown): InstagramMonitor {
  const current = monitors.get(id);
  if (!current) throw new Error("Monitor not found.");
  const next = validateMonitorInput({ ...current, ...(input as object), userId: current.userId, plan: current.plan });
  const updated = { ...current, ...next, updatedAt: new Date().toISOString() };
  monitors.set(id, updated);
  return updated;
}

export function listMonitors(userId = "local-user"): InstagramMonitor[] {
  return [...monitors.values()].filter(monitor => monitor.userId === userId);
}

export function setRunId(id: string, apifyRunId: string): InstagramMonitor {
  const monitor = monitors.get(id);
  if (!monitor) throw new Error("Monitor not found.");
  const updated = { ...monitor, apifyRunId, lastRunAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  monitors.set(id, updated);
  return updated;
}

export function addFeedRecords(monitorId: string, records: InstagramPostRecord[]): InstagramPostRecord[] {
  const existing = feed.get(monitorId) ?? [];
  const known = new Set(existing.map(record => record.post.id));
  const newRecords = records.filter(record => record.post?.id && !known.has(record.post.id));
  feed.set(monitorId, [...newRecords, ...existing].slice(0, 1000));
  return newRecords;
}

export function getFeed(monitorId: string): InstagramPostRecord[] {
  return feed.get(monitorId) ?? [];
}

export async function ingestApifyRun(runId: string, datasetId: string): Promise<number> {
  const token = process.env.APIFY_API_TOKEN;
  const monitor = getMonitorByRunId(runId);
  if (!token || !monitor) throw new Error("Apify run or monitor not found.");

  const response = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&clean=true`,
  );
  if (!response.ok) throw new Error(`Apify dataset read failed (${response.status}): ${await response.text()}`);
  const records = (await response.json()) as InstagramPostRecord[];
  return addFeedRecords(monitor.id, records).length;
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function startApifyRun(
  monitor: InstagramMonitor,
): Promise<{ id: string; status: string; datasetId?: string }> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_SOCIAL_MONITOR_ACTOR_ID ?? process.env.APIFY_INSTAGRAM_ACTOR_ID;
  if (!token || !actorId) {
    throw new Error("APIFY_API_TOKEN and APIFY_INSTAGRAM_ACTOR_ID must be configured.");
  }

  const response = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=60`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: "instagram",
        accounts: monitor.accounts,
        maxPostsPerAccount: monitor.maxPostsPerAccount,
        onlyNew: true,
        monitorId: monitor.id,
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `Apify run creation failed (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  const body = (await response.json()) as {
    data?: { id?: string; status?: string; defaultDatasetId?: string };
  };
  if (!body.data?.id) throw new Error("Apify returned no run ID.");
  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(body.data.status ?? "")) {
    throw new Error(`Apify run ended with status ${body.data.status}.`);
  }
  setRunId(monitor.id, body.data.id);
  return {
    id: body.data.id,
    status: body.data.status ?? "RUNNING",
    datasetId: body.data.defaultDatasetId,
  };
}
