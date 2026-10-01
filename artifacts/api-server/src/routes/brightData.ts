import { Router, type IRouter } from "express";
import {
  subscribeToSource,
  unsubscribeFromSource,
  getSubscribedSources,
  getUserFeed,
  ingestWebhookPayload,
  initBrightDataCollection,
  getAllSources,
  stopCollectionLoop,
  collectFromSource,
} from "../services/brightDataCollection";
import { fetchProfile } from "../services/brightDataUnified";
import { supportsPlatform } from "../services/brightDataDatasets";
import { authUser } from "../middleware/auth";

const router: IRouter = Router();

// Bright Data can authenticate a webhook in three ways, depending on whether the
// delivery was triggered by our own /trigger call (query param), by a DCA
// collector configured in the dashboard (custom header), or by a dashboard
// webhook that supports an Authorization header.
function isAuthorizedWebhook(
  secret: string,
  authorization: string | undefined,
  headerSecret: string | string[] | undefined,
  querySecret: unknown,
): boolean {
  if (authorization === `Bearer ${secret}`) return true;
  if (typeof headerSecret === "string" && headerSecret === secret) return true;
  if (typeof querySecret === "string" && querySecret === secret) return true;
  return false;
}

// Initialize collection on first route access
let initialized = false;

// Safety net for tests and embedders that hit routes without going through
// index.ts, which awaits this itself before listening.
function ensureInitialized(): void {
  if (!initialized) {
    initialized = true;
    void initBrightDataCollection();
  }
}

// ─── Webhook Endpoint (called by Bright Data) ─────────────────────────────

// Bright Data deliveries arrive here: /api/webhooks/brightdata (kept outside the
// /brightdata prefix so the URL stored in BRIGHTDATA_WEBHOOK_URL stays valid).
export const webhookRouter: IRouter = Router();

webhookRouter.post("/brightdata", async (req, res) => {
  try {
    ensureInitialized();
    const secret = process.env.BRIGHTDATA_WEBHOOK_SECRET;
    if (secret && !isAuthorizedWebhook(secret, req.headers.authorization, req.headers["x-webhook-secret"], req.query.secret)) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }

    const payload = req.body;
    const datasetId = typeof req.query.dataset_id === "string" ? req.query.dataset_id : undefined;
    const sourceId = typeof req.query.source_id === "string" ? req.query.source_id : undefined;
    // Dataset triggers post an array; Scraper Studio posts { posts: [...] }.
    const records = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object"
        ? [payload]
        : null;
    if (!records) {
      return res.status(400).json({ error: "Expected an array of posts" });
    }

    const result = await ingestWebhookPayload(records, { datasetId, sourceId });
    console.log(
      `[BrightData] Webhook delivery source=${sourceId ?? datasetId ?? "unknown"} ` +
        `ingested=${result.ingested} duplicates=${result.duplicates} ` +
        `skipped=${result.skipped} errors=${result.errors}`,
    );
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Webhook processing failed" });
  }
});

// ─── Profile Fetch (on-demand via Bright Data API) ────────────────────────

router.get("/profile/:platform", async (req, res) => {
  try {
    ensureInitialized();
    const { platform } = req.params;
    const { url, username } = req.query as { url?: string; username?: string };

    if (!url && !username) {
      return res.status(400).json({ error: "url or username required" });
    }

    const targetUrl = url ?? username ?? "";
    const profile = await fetchProfile(platform, targetUrl);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to fetch profile" });
  }
});

router.get("/platforms", (_req, res) => {
  res.json({
    configured: !!process.env.BRIGHTDATA_API_TOKEN,
    supportedPlatforms: ["instagram", "linkedin", "tiktok", "x", "facebook"],
    redditNote: "No Bright Data dataset exists for Reddit. Use Apify actor instead.",
  });
});

// ─── Source Management ────────────────────────────────────────────────────

/** Per-tier account caps; the tier comes from the signed-in account, never
 *  from the request body. 'admin' (the owner account) is unlimited. */
const ACCOUNT_LIMITS: Record<string, number> = {
  free: 3,
  pro: 10,
  "mega-pro": 20,
  admin: Infinity,
};

router.post("/sources", (req, res) => {
  try {
    ensureInitialized();
    const { platform, username } = req.body as {
      platform: string;
      username: string;
    };
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    if (!platform || !username) {
      return res.status(400).json({ error: "platform and username required" });
    }

    if (!supportsPlatform(platform as any)) {
      return res.status(400).json({ error: `Platform ${platform} is not supported via Bright Data` });
    }

    const limit = ACCOUNT_LIMITS[user.tier] ?? ACCOUNT_LIMITS.free!;
    const existing = getSubscribedSources(user.id);
    if (existing.length >= limit) {
      return res.status(400).json({
        error: `Plan limit reached (${limit} accounts). Upgrade to add more.`,
      });
    }

    const source = subscribeToSource(user.id, platform as any, username);
    // `subscription` is kept for older clients; new clients should read `source.id`.
    return res.status(201).json({ source, subscription: { sourceId: source.id } });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create source" });
  }
});

router.delete("/sources/:platform/:username", (req, res) => {
  try {
    ensureInitialized();
    const { platform, username } = req.params;
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required." });

    const ok = unsubscribeFromSource(user.id, platform as any, username);
    if (!ok) return res.status(404).json({ error: "Subscription not found" });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to unsubscribe" });
  }
});

router.get("/sources", (req, res) => {
  ensureInitialized();
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required." });
  const subs = getSubscribedSources(user.id);
  return res.json({ sources: subs });
});

router.get("/sources/all", (_req, res) => {
  ensureInitialized();
  res.json({ sources: getAllSources() });
});

// ─── Feed ─────────────────────────────────────────────────────────────────

router.get("/feed", (req, res) => {
  ensureInitialized();
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required." });
  const feed = getUserFeed(user.id);
  return res.json({ posts: feed });
});

// ─── Status ───────────────────────────────────────────────────────────────

router.get("/status", (_req, res) => {
  ensureInitialized();
  res.json({
    configured: !!process.env.BRIGHTDATA_API_TOKEN,
    webhookEndpoint: "/api/webhooks/brightdata",
    supportedPlatforms: ["instagram", "linkedin", "tiktok", "x", "facebook"],
    redditNote: "No Bright Data dataset. Use Apify.",
    collectionIntervalMs: 60 * 60 * 1000,
    sourcesCount: getAllSources().length,
  });
});

// ─── Manual Collection Trigger (for testing) ──────────────────────────────

router.post("/collect/:platform/:username", async (req, res) => {
  try {
    ensureInitialized();
    const { platform, username } = req.params;
    const source = getAllSources().find(
      s => s.platform === platform && s.username.toLowerCase() === username.toLowerCase()
    );
    if (!source) return res.status(404).json({ error: "Source not found" });

    // Trigger immediate collection
    const result = await collectFromSource(source);
    // `added`, not the raw count: Bright Data paginates and the feed dedups.
    return res.json({ ok: true, postsCollected: result.added });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Collection failed" });
  }
});

export { router as default, stopCollectionLoop };
