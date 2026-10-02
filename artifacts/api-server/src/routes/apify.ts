import { Router, type IRouter, type Request, type Response } from "express";
import { apifyUnified } from "../services/apifyUnified";
import { authUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

/**
 * Apify Unified Social Scraper
 * Single actor handles all platforms: Instagram, TikTok, X, Facebook, Reddit, LinkedIn
 */

// Get available platforms and their config
router.get("/config", requireAuth, async (req: Request, res: Response) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  const config = await apifyUnified.getConfig(user.id);
  return res.json(config);
});

// Get platform-specific config
router.get("/config/:platform", requireAuth, async (req: Request, res: Response) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required" });
  const { platform } = req.params;
  const config = await apifyUnified.getPlatformConfig(user.id, platform as any);
  return res.json(config);
});

// Update platform configuration (followed accounts, credentials)
router.patch("/config/:platform", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
    const config = req.body;
    await apifyUnified.updatePlatformConfig(user.id, platform as any, config);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update config" });
  }
});

// Trigger immediate collection for a platform/account
router.post("/collect/:platform", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "username required" });
    }
    const result = await apifyUnified.collectPlatform(user.id, platform, username);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Collection failed" });
  }
});

// Get feed posts (unified across all platforms)
router.get("/feed", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const { platform, limit = "100", cursor } = req.query;
    const posts = await apifyUnified.getFeed(user.id, {
      platform: platform as string,
      limit: parseInt(limit as string, 10),
      cursor: cursor as string,
    });
    return res.json({ posts, cursor: posts.length > 0 ? posts[posts.length - 1].id : undefined });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch feed" });
  }
});

// Get subscribed sources
router.get("/sources", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const sources = await apifyUnified.getSources(user.id);
    return res.json({ sources });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch sources" });
  }
});

// Subscribe to a source
router.post("/sources", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const { platform, username } = req.body;
    if (!platform || !username) {
      return res.status(400).json({ error: "platform and username required" });
    }
    const source = await apifyUnified.subscribeSource(user.id, platform as any, username);
    return res.json({ ok: true, source });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to subscribe" });
  }
});

// Unsubscribe from a source
router.delete("/sources/:platform/:username", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const platform = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
    const username = Array.isArray(req.params.username) ? req.params.username[0] : req.params.username;
    await apifyUnified.unsubscribeSource(user.id, platform as any, username);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to unsubscribe" });
  }
});

// Trigger collection for all enabled platforms
router.post("/collect-all", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const result = await apifyUnified.collectAllPlatforms(user.id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Collection failed" });
  }
});

export default router;