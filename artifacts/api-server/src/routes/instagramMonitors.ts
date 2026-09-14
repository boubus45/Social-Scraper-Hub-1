import { Router, type IRouter } from "express";
import {
  addFeedRecords,
  createMonitor,
  getFeed,
  getMonitor,
  getMonitorByRunId,
  ingestApifyRun,
  listMonitors,
  startApifyRun,
  updateMonitor,
} from "../services/instagramMonitor";

const router: IRouter = Router();

router.get("/monitors/instagram", (req, res) => {
  res.json({ monitors: listMonitors(typeof req.query.userId === "string" ? req.query.userId : "local-user") });
});

router.post("/monitors/instagram", (req, res) => {
  try {
    res.status(201).json({ monitor: createMonitor(req.body) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid monitor." });
  }
});

router.get("/monitors/instagram/:id", (req, res) => {
  const monitor = getMonitor(req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });
  return res.json({ monitor });
});

router.patch("/monitors/instagram/:id", (req, res) => {
  try {
    return res.json({ monitor: updateMonitor(req.params.id, req.body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid monitor.";
    return res.status(message === "Monitor not found." ? 404 : 400).json({ error: message });
  }
});

router.post("/monitors/instagram/:id/run", async (req, res) => {
  const monitor = getMonitor(req.params.id);
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });
  try {
    return res.status(202).json({ run: await startApifyRun(monitor) });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to start Apify run." });
  }
});

router.get("/feeds/instagram", (req, res) => {
  const monitorId = typeof req.query.monitorId === "string" ? req.query.monitorId : "";
  if (!monitorId || !getMonitor(monitorId)) return res.status(404).json({ error: "Monitor not found." });
  return res.json({ posts: getFeed(monitorId) });
});

router.post("/webhooks/apify/instagram", (req, res) => {
  const expectedSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (expectedSecret && req.header("x-apify-webhook-secret") !== expectedSecret) {
    return res.status(401).json({ error: "Invalid webhook secret." });
  }

  const monitorId = typeof req.body?.monitorId === "string" ? req.body.monitorId : "";
  const runId = typeof req.body?.resource?.id === "string" ? req.body.resource.id : "";
  const datasetId = typeof req.body?.resource?.defaultDatasetId === "string"
    ? req.body.resource.defaultDatasetId
    : "";
  const monitor = monitorId ? getMonitor(monitorId) : getMonitorByRunId(runId);
  if (!monitor) return res.status(400).json({ error: "Unknown monitor or Apify run." });

  if (datasetId && runId) {
    void ingestApifyRun(runId, datasetId)
      .then(accepted => res.json({ accepted }))
      .catch(error => res.status(502).json({ error: error instanceof Error ? error.message : "Unable to ingest dataset." }));
    return;
  }

  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const newRecords = addFeedRecords(monitor.id, records);
  return res.json({ accepted: newRecords.length });
});

export default router;
