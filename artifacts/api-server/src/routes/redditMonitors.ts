import { Router, type IRouter } from "express";
import {
  addRedditFeedRecords,
  createRedditMonitor,
  getRedditFeed,
  getRedditMonitor,
  startRedditRun,
  updateRedditMonitor,
} from "../services/redditMonitor";

const router: IRouter = Router();

router.post("/monitors/reddit", (req, res) => {
  try {
    return res.status(201).json({ monitor: createRedditMonitor(req.body) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor." });
  }
});

router.patch("/monitors/reddit/:id", (req, res) => {
  try {
    return res.json({ monitor: updateRedditMonitor(req.params.id, req.body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid monitor.";
    return res.status(message === "Monitor not found." ? 404 : 400).json({ error: message });
  }
});

router.post("/monitors/reddit/:id/run", async (req, res) => {
  const monitor = getRedditMonitor(req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });
  try {
    // Accept credentials from the request body for OAuth
    const creds = req.body?.credentials as { clientId?: string; clientSecret?: string; username?: string; password?: string } | undefined;
    const run = await startRedditRun(monitor, creds);
    return res.status(202).json({ run, posts: getRedditFeed(monitor.id) });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to start Apify run." });
  }
});

router.get("/feeds/reddit", (req, res) => {
  const monitorId = typeof req.query.monitorId === "string" ? req.query.monitorId : "";
  if (!monitorId || !getRedditMonitor(monitorId)) return res.status(404).json({ error: "Monitor not found." });
  return res.json({ posts: getRedditFeed(monitorId) });
});

router.post("/webhooks/apify/reddit", (req, res) => {
  const monitorId = typeof req.body?.monitorId === "string" ? req.body.monitorId : "";
  if (!monitorId || !getRedditMonitor(monitorId)) return res.status(400).json({ error: "Unknown monitor." });
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  return res.json({ accepted: addRedditFeedRecords(monitorId, records).length });
});

export default router;
