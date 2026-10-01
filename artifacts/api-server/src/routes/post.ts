import { Router, type IRouter } from "express";
import { PLATFORM_POSTERS, PostResult } from "../services/platformPosters";
import { isConnected } from "../services/oauthService";
import { authUser } from "../middleware/auth";

const router: IRouter = Router();

// Post to a platform using stored OAuth tokens (for scheduled posts)
router.post("/post/:platform", async (req, res) => {
  try {
    const platform = req.params.platform;
    const { content, subreddit } = req.body as {
      content: string;
      subreddit?: string;
    };
    // The signed-in account owns the connection; a body cannot post as someone
    // else.
    const userId = authUser(req)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Sign in required." });
    }

    if (!content) {
      return res.status(400).json({ error: "Content required." });
    }

    const poster = PLATFORM_POSTERS[platform];
    if (!poster) {
      return res.status(400).json({ error: `Posting not supported for ${platform}.` });
    }

    const connected = isConnected(userId, platform);
    if (!connected) {
      return res.status(401).json({ error: `${platform} not connected. Re-authorize in Settings.` });
    }

    const result = await poster(content, userId, subreddit ? { subreddit } : undefined);
    if (result.ok) {
      return res.json(result);
    }
    return res.status(502).json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Post failed." });
  }
});

export default router;
