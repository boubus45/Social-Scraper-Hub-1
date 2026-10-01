import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthUser } from "../services/authService";

/**
 * `requireAuth` parks the verified token on the request. Express's `Request`
 * cannot be augmented here (pnpm's strict store hides
 * `express-serve-static-core`, so `declare module` would not resolve), so
 * routes read it through this accessor instead of a module augmentation.
 */
type AuthedRequest = Request & { user?: AuthUser };

export function authUser(req: Request): AuthUser | undefined {
  return (req as AuthedRequest).user;
}

// Everything under /api needs a token except: health, the sign-in flow itself,
// webhook deliveries (they authenticate with their own secrets) and the status
// endpoint the app shows before anyone is signed in. Platform OAuth stays
// protected as well — its browser redirect lands on the app's URL scheme, and
// both HTTP calls (auth-url, callback) come from the signed-in app.
const PUBLIC_PREFIXES = ["/healthz", "/auth/", "/webhooks/"];
const PUBLIC_PATHS = new Set(["/brightdata/status"]);

export function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}
