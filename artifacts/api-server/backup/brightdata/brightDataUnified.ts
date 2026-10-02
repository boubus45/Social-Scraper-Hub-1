// Unified Bright Data service — on-demand profile fetch for the platforms that
// expose a profile dataset (Instagram, LinkedIn, TikTok).
//
// Collection (webhooks, hourly cron) lives in brightDataCollection.ts; both go
// through brightDataNormalize.ts so a post maps the same way everywhere.
export type {
  NormalizedPost,
  NormalizedProfile,
  ProfilePost,
} from "./brightDataNormalize.ts";

import { normalizeProfile } from "./brightDataNormalize.ts";
import { parseDatasetPayload, request } from "./brightDataHttp.ts";

type DatasetMap = Record<string, { profile: string; posts?: string }>;

// Dataset IDs verified against the live API.
const DATASETS: DatasetMap = {
  instagram: { profile: "gd_l1vikfch901nx3by4" },
  linkedin: { profile: "gd_l1viktl72bvl7bjuj0" },
  tiktok: { profile: "gd_l1villgoiiidt09ci" },
  // X and Facebook profile fetches go through the collection manager: neither
  // exposes a profile dataset that accepts an arbitrary profile URL.
};

async function triggerCollection(datasetId: string, inputs: Array<Record<string, string>>): Promise<string> {
  const response = await request(
    `/datasets/v3/trigger?dataset_id=${datasetId}&format=json&uncompressed_webhook=true`,
    { method: "POST", body: JSON.stringify(inputs) },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trigger failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { snapshot_id?: string; error?: string };
  if (!data.snapshot_id) throw new Error(data.error ?? "No snapshot ID returned");
  return data.snapshot_id;
}

async function waitForSnapshot(snapshotId: string, timeoutMs = 120000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request(`/datasets/v3/snapshot/${snapshotId}?format=json`);
    if (response.ok) {
      // Ready snapshots are arrays; running ones parse to nothing.
      const records = parseDatasetPayload(await response.text());
      if (records.length > 0) return records[0] as Record<string, unknown>;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Snapshot ${snapshotId} timed out after ${timeoutMs}ms`);
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function fetchProfile(
  platform: string,
  urlOrUsername: string,
): Promise<ReturnType<typeof normalizeProfile>> {
  const datasets = DATASETS[platform];
  if (!datasets) {
    throw new Error(
      `Platform "${platform}" is not supported for profile fetch. Available: ${Object.keys(DATASETS).join(", ")}`,
    );
  }

  let url = urlOrUsername;
  if (!url.startsWith("http")) {
    url = getCanonicalUrl(platform, url);
  }

  const snapshotId = await triggerCollection(datasets.profile, [{ url }]);
  const raw = await waitForSnapshot(snapshotId);
  return normalizeProfile(platform, raw);
}

function getCanonicalUrl(platform: string, username: string): string {
  const clean = username.trim().replace(/^@/, "");
  switch (platform) {
    case "instagram": return `https://instagram.com/${clean}`;
    case "linkedin": return `https://linkedin.com/in/${clean}`;
    case "tiktok": return `https://www.tiktok.com/@${clean}`;
    case "x": return `https://x.com/${clean}`;
    case "facebook": return `https://facebook.com/${clean}`;
    default: return `https://${platform}.com/${clean}`;
  }
}

export function getSupportedPlatforms(): string[] {
  return Object.keys(DATASETS);
}
