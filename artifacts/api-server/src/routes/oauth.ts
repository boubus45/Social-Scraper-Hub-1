import { Router, type IRouter } from "express";
import {
  exchangeCodeForToken,
  refreshTokenIfNeeded,
  clearToken,
  isConnected,
  getToken,
} from "../services/oauthService";

const router: IRouter = Router();

import crypto from "node:crypto";

// OAuth app configurations (read from env)
const OAUTH_APPS: Record<string, {
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  usePkce?: boolean;
  authMethod?: "basic" | "body"; // how to send client credentials
} | null> = {
  reddit: process.env.REDDIT_OAUTH_CLIENT_ID ? {
    clientId: process.env.REDDIT_OAUTH_CLIENT_ID,
    clientSecret: process.env.REDDIT_OAUTH_CLIENT_SECRET,
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    redirectUri: process.env.REDDIT_OAUTH_REDIRECT_URI ?? "socialscraper://oauth/reddit",
    scopes: ["read", "identity", "submit"],
    authMethod: "basic",
  } : null,
  x: process.env.X_OAUTH_CLIENT_ID ? {
    clientId: process.env.X_OAUTH_CLIENT_ID,
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    redirectUri: process.env.X_OAUTH_REDIRECT_URI ?? "socialscraper://oauth/x",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    usePkce: true,
    authMethod: "body",
  } : null,
  linkedin: process.env.LINKEDIN_OAUTH_CLIENT_ID ? {
    clientId: process.env.LINKEDIN_OAUTH_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_OAUTH_CLIENT_SECRET,
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    redirectUri: process.env.LINKEDIN_OAUTH_REDIRECT_URI ?? "socialscraper://oauth/linkedin",
    scopes: ["openid", "profile", "email", "w_member_social"],
    authMethod: "body",
  } : null,
  facebook: process.env.FACEBOOK_OAUTH_CLIENT_ID ? {
    clientId: process.env.FACEBOOK_OAUTH_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_OAUTH_CLIENT_SECRET,
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI ?? "socialscraper://oauth/facebook",
    scopes: ["public_profile", "email"],
    authMethod: "body",
  } : null,
  instagram: process.env.INSTAGRAM_OAUTH_CLIENT_ID ? {
    clientId: process.env.INSTAGRAM_OAUTH_CLIENT_ID,
    clientSecret: process.env.INSTAGRAM_OAUTH_CLIENT_SECRET,
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    redirectUri: process.env.INSTAGRAM_OAUTH_REDIRECT_URI ?? "socialscraper://oauth/instagram",
    scopes: ["user_profile", "user_media"],
    authMethod: "body",
  } : null,
};

// Returns the authorization URL with client_id embedded
// This lets the frontend open auth without knowing the client_id
router.get("/oauth/:platform/auth-url", (req, res): void => {
  const platform = req.params.platform;
  const app = OAUTH_APPS[platform];
  
  if (!app) {
    res.status(400).json({ 
      error: `OAuth not configured for ${platform}. Set ${platform.toUpperCase()}_OAUTH_CLIENT_ID env var on the backend.` 
    });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const params: Record<string, string> = {
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    scope: app.scopes.join(" "),
    state,
  };

  const url = `${app.authUrl}?${new URLSearchParams(params).toString()}`;
  res.json({ url, state, redirectUri: app.redirectUri });
});

// Exchanges an OAuth authorization code for an access token
// Called by the mobile app after the user authorizes in the browser
router.post("/oauth/:platform/callback", async (req, res) => {
  try {
    const platform = req.params.platform;
    const { code, userId, codeVerifier, state } = req.body as {
      code: string;
      userId: string;
      codeVerifier?: string;
      state?: string;
    };

    if (!code) {
      return res.status(400).json({ error: "Authorization code required." });
    }
    if (!userId) {
      return res.status(400).json({ error: "userId required." });
    }

    const result = await exchangeCodeForToken(platform, code, userId, codeVerifier);
    if (!result.ok) {
      return res.status(400).json({ error: result.error ?? "Token exchange failed." });
    }

    return res.json({
      ok: true,
      token: result.token,
      connected: true,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "OAuth callback failed." });
  }
});

// Checks connection status for a platform
router.get("/oauth/:platform/status", (req, res) => {
  const platform = req.params.platform;
  const userId = typeof req.query.userId === "string" ? req.query.userId : "local-user";
  const connected = isConnected(userId, platform);
  const token = getToken(userId, platform);
  const configured = !!OAUTH_APPS[platform];
  res.json({
    platform,
    configured,
    connected,
    expiresAt: token?.expiresAt,
  });
});

// Disconnects a platform (revokes by clearing the token)
router.delete("/oauth/:platform", (req, res) => {
  const platform = req.params.platform;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "local-user";
  clearToken(userId, platform);
  res.json({ ok: true, disconnected: true });
});

// Internal: get a valid (refreshed) token for posting
router.post("/oauth/:platform/token", async (req, res): Promise<void> => {
  const platform = req.params.platform;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "local-user";
  const token = await refreshTokenIfNeeded(platform, userId);
  if (!token) {
    res.status(401).json({ error: "Not connected. Re-authorize in Settings." });
    return;
  }
  res.json({ token });
});

export default router;
