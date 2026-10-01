import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import {
  isValidEmail,
  normalizeEmail,
  requestLoginCode,
  upsertExternalUser,
  verifyLoginCode,
} from "../services/authService";
import { authUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

/** Where Google sends the browser back, then on to the app's URL scheme. */
function publicBaseUrl(): string {
  const explicit = process.env.API_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const webhook = process.env.BRIGHTDATA_WEBHOOK_URL;
  if (webhook) return webhook.replace(/\/api\/webhooks\/brightdata.*$/, "");
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Sign-in codes are requested for an address; nothing here reveals whether
 *  an account exists — the flow creates accounts on first verified code. */
router.post("/auth/request-code", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  try {
    const result = await requestLoginCode(email);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not send the code.",
    });
  }
});

router.post("/auth/verify-code", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "The code is 6 digits." });
  }
  try {
    const { token, user } = await verifyLoginCode(email, code);
    return res.json({ token, user });
  } catch (error) {
    return res.status(401).json({
      error: error instanceof Error ? error.message : "That code is not valid.",
    });
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Sign in required." });
  return res.json({ user });
});

/** Lets the app grey out sign-in options the backend cannot complete yet. */
router.get("/auth/providers", (_req, res) => {
  res.json({ google: googleConfigured() });
});

// ─── Google sign-in (staged: works once GOOGLE_CLIENT_ID/SECRET are set) ────
// The browser round-trips through this server (which holds the client secret)
// and is finally handed to the app as socialscraper://auth?token=…

const googleStates = new Map<string, number>();

router.post("/auth/google/auth-url", (_req, res) => {
  if (!googleConfigured()) {
    return res
      .status(501)
      .json({ error: "Google sign-in is not configured on the backend yet." });
  }
  const state = crypto.randomBytes(16).toString("base64url");
  googleStates.set(state, Date.now() + 10 * 60 * 1000);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${publicBaseUrl()}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return res.json({ url: url.toString(), redirectUri: "socialscraper://auth" });
});

router.get("/auth/google/callback", async (req, res) => {
  const redirect = (query: Record<string, string>) => {
    const target = new URL("socialscraper://auth");
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
    return res.redirect(302, target.toString());
  };

  try {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expires = googleStates.get(state);
    googleStates.delete(state);
    if (!expires || expires < Date.now()) {
      return redirect({ error: "expired" });
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) return redirect({ error: "denied" });

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${publicBaseUrl()}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return redirect({ error: "exchange_failed" });
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return redirect({ error: "exchange_failed" });

    // tokeninfo validates the audience and expiry for us.
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`,
    );
    if (!infoRes.ok) return redirect({ error: "invalid_token" });
    const info = (await infoRes.json()) as {
      aud?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (info.aud !== clientId || !info.email) return redirect({ error: "invalid_token" });

    const { token } = await upsertExternalUser(info.email.toLowerCase(), {
      name: info.name ?? null,
      avatarUrl: info.picture ?? null,
    });
    return redirect({ token });
  } catch (error) {
    return redirect({ error: "server_error" });
  }
});

export default router;
