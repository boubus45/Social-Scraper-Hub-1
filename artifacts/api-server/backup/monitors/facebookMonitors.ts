import { Router, type IRouter } from "express";

const router: IRouter = Router();

// In-memory stores
const monitors = new Map<string, { id: string; pages: string[]; limit: number; enabled: boolean; createdAt: string; updatedAt: string }>();
const feeds = new Map<string, Array<Record<string, unknown>>>();

router.post("/monitors/facebook", (req, res) => {
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const pages = Array.isArray(body.pages)
      ? [...new Set(body.pages.filter((p): p is string => typeof p === "string").map(p => p.trim().replace(/^@/, "").replace(/^.*facebook\.com\//i, "").split("/")[0].toLowerCase()).filter(Boolean))]
      : [];
    
    if (pages.length === 0) return res.status(400).json({ error: "At least one Facebook page username is required." });
    if (pages.length > 10) return res.status(400).json({ error: "Up to 10 pages per monitor." });
    
    const limit = Math.min(Math.max(typeof body.limit === "number" ? body.limit : 10, 1), 25);
    const now = new Date().toISOString();
    const monitor = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      pages,
      limit,
      enabled: body.enabled !== false,
      createdAt: now,
      updatedAt: now,
    };
    monitors.set(monitor.id, monitor);
    feeds.set(monitor.id, []);
    return res.status(201).json({ monitor });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor." });
  }
});

router.patch("/monitors/facebook/:id", (req, res) => {
  const current = monitors.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Monitor not found." });
  try {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const pages = Array.isArray(body.pages)
      ? [...new Set(body.pages.filter((p): p is string => typeof p === "string").map(p => p.trim().replace(/^@/, "").replace(/^.*facebook\.com\//i, "").split("/")[0].toLowerCase()).filter(Boolean))]
      : current.pages;
    const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 25) : current.limit;
    const updated = { ...current, pages, limit, enabled: body.enabled !== false, updatedAt: new Date().toISOString() };
    monitors.set(req.params.id, updated);
    return res.json({ monitor: updated });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor." });
  }
});

router.post("/monitors/facebook/:id/run", async (req, res) => {
  const monitor = monitors.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });
  try {
    const token = process.env.APIFY_API_TOKEN;
    const actorId = process.env.APIFY_FACEBOOK_MONITOR_ACTOR_ID;
    if (!token || !actorId) {
      return res.status(502).json({ error: "Facebook monitor actor not configured. Set APIFY_FACEBOOK_MONITOR_ACTOR_ID." });
    }

    const cookies = typeof req.body?.cookies === "string" ? req.body.cookies : undefined;
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=120`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pages: monitor.pages,
          maxPostsPerPage: monitor.limit,
          monitorId: monitor.id,
          ...(cookies ? { cookies } : {}),
        }),
      },
    );
    if (!response.ok) throw new Error(`Apify run creation failed (${response.status}): ${(await response.text()).trim()}`);
    const body = (await response.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } };
    if (!body.data?.id) throw new Error("Apify returned no run ID.");
    
    if (body.data.defaultDatasetId) {
      const dataset = await fetch(
        `https://api.apify.com/v2/datasets/${encodeURIComponent(body.data.defaultDatasetId)}/items?token=${encodeURIComponent(token)}&clean=true`,
      );
      if (dataset.ok) {
        const records = (await dataset.json()) as Array<Record<string, unknown>>;
        const existing = feeds.get(monitor.id) ?? [];
        const known = new Set(existing.map(r => (r.post as Record<string, unknown>)?.id));
        const fresh = records.filter(r => !known.has((r.post as Record<string, unknown>)?.id));
        feeds.set(monitor.id, [...fresh, ...existing].slice(0, 1000));
      }
    }
    return res.status(202).json({ run: { id: body.data.id, status: body.data.status ?? "RUNNING" }, posts: feeds.get(monitor.id) ?? [] });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to start Facebook monitor run." });
  }
});

router.get("/feeds/facebook", (req, res) => {
  const monitorId = typeof req.query.monitorId === "string" ? req.query.monitorId : "";
  if (!monitorId || !monitors.get(monitorId)) return res.status(404).json({ error: "Monitor not found." });
  return res.json({ posts: feeds.get(monitorId) ?? [] });
});

export default router;
