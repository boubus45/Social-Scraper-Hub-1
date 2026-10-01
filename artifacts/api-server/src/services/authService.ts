// Email-code sign-in: issue a short-lived code, verify it, mint a token.
//
// Three pieces live here: the users/authorization-code tables, a hand-rolled
// HS256 JWT (the payload is a handful of fields — a dependency is not worth
// it), and delivery of the code itself. Delivery is Brevo's SMTP API when
// BREVO_API_KEY is set and otherwise falls back to printing the code in the
// server log, so the flow is fully usable before any mail credentials exist.

import crypto from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, count, desc, eq, gte } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import { users, authCodes } from "@workspace/db/schema";
import { logger } from "../lib/logger";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** 'email' (one-time code) or 'google' — the method of the latest sign-in. */
  provider: string;
  tier: string;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const TOKEN_TTL_S = 60 * 60 * 24 * 30; // 30 days

function createConnection(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 4 });
  return { pool, db: drizzle(pool, { schema }) };
}

type Connection = ReturnType<typeof createConnection>;

let connection: Connection | null = null;

/**
 * Lazy connection: unlike `@workspace/db` (which throws at import time when
 * DATABASE_URL is missing) this only opens the database once someone actually
 * signs in, so the server still boots for health checks without one.
 */
function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!connection) connection = createConnection(connectionString);
  return connection.db;
}

type Db = NonNullable<ReturnType<typeof getDb>>;

/** Server-wide signing key. Generated when unset (dev/test): valid, but every
 *  restart invalidates sessions — Render must set AUTH_SECRET. */
const AUTH_SECRET: string =
  process.env.AUTH_SECRET ?? crypto.randomBytes(32).toString("hex");

if (!process.env.AUTH_SECRET) {
  logger.warn(
    "AUTH_SECRET is not set — using an ephemeral key; all sessions are invalidated on restart.",
  );
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(user: AuthUser): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      tier: user.tier,
      iat: now,
      exp: now + TOKEN_TTL_S,
    }),
  );
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): AuthUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: string;
      email?: string;
      name?: string | null;
      avatarUrl?: string | null;
      provider?: string;
      tier?: string;
      exp?: number;
    };
    if (!claims.sub || !claims.email) return null;
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
    return {
      id: claims.sub,
      email: claims.email,
      name: claims.name ?? null,
      avatarUrl: claims.avatarUrl ?? null,
      provider: claims.provider ?? "email",
      tier: claims.tier ?? "free",
    };
  } catch {
    return null;
  }
}

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** The account that owns everything the pre-auth install created. */
function adminEmail(): string | null {
  const value = process.env.ADMIN_EMAIL;
  return value ? value.trim().toLowerCase() : null;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    provider: row.provider,
    tier: row.tier,
  };
}

/** Find the account for an email, creating it on first sign-in. */
async function findOrCreateUser(
  database: Db,
  email: string,
  profile?: { name?: string | null; avatarUrl?: string | null },
  provider?: "email" | "google",
): Promise<AuthUser> {
  const existing = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    const patch: Partial<typeof users.$inferInsert> = { lastLoginAt: new Date() };
    // The admin address is authoritative: it always lands on the admin tier.
    if (email === adminEmail() && row.tier !== "admin") patch.tier = "admin";
    if (provider) patch.provider = provider;
    // The name belongs to the account holder once set: a later Google sign-in
    // must not roll back a name they edited. The Google photo is refreshed.
    if (profile?.name && !row.name) patch.name = profile.name;
    if (profile?.avatarUrl) patch.avatarUrl = profile.avatarUrl;
    const updated = await database
      .update(users)
      .set(patch)
      .where(eq(users.id, row.id))
      .returning();
    return toAuthUser(updated[0] ?? row);
  }

  const isAdmin = email === adminEmail();
  const values: typeof users.$inferInsert = {
    // The admin keeps the id the app has always used, so the feed, sources and
    // subscriptions already in the database follow the account automatically.
    id: isAdmin ? "local-user" : newId("usr"),
    email,
    name: profile?.name ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    provider: provider ?? "email",
    tier: isAdmin ? "admin" : "free",
    lastLoginAt: new Date(),
  };

  try {
    const inserted = await database.insert(users).values(values).returning();
    return toAuthUser(inserted[0]!);
  } catch (error) {
    // Unique violation: an admin row with the id already exists (or a racing
    // request inserted the same email first) — fall back to a lookup.
    const row = await database
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (row.length > 0) return toAuthUser(row[0]!);
    if (values.id === "local-user") {
      // `local-user` exists under a different address: claim it, since that is
      // the data this account is meant to manage.
      const claimed = await database
        .update(users)
        .set({ email, tier: "admin", lastLoginAt: new Date() })
        .where(eq(users.id, "local-user"))
        .returning();
      if (claimed.length > 0) return toAuthUser(claimed[0]!);
    }
    throw error;
  }
}

export interface IssuedCode {
  delivery: "email" | "log";
  expiresInSec: number;
}

/** Create a fresh 6-digit code for the address and deliver it. */
export async function requestLoginCode(email: string): Promise<IssuedCode> {
  const database = getDb();
  if (!database) {
    throw new Error("Authentication requires DATABASE_URL to be configured.");
  }

  const recent = await database
    .select({ value: count() })
    .from(authCodes)
    .where(
      and(
        eq(authCodes.email, email),
        gte(authCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if ((recent[0]?.value ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    throw new Error("Too many codes requested for this email. Try again later.");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  // One live code per address: requesting a new one invalidates the previous.
  await database.delete(authCodes).where(eq(authCodes.email, email));
  await database.insert(authCodes).values({
    id: newId("code"),
    email,
    codeHash: hmac(`${email}:${code}`),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const delivery = await deliverCode(email, code);
  return { delivery, expiresInSec: CODE_TTL_MS / 1000 };
}

/** Check a code and return the signed-in account. */
export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<{ token: string; user: AuthUser }> {
  const database = getDb();
  if (!database) {
    throw new Error("Authentication requires DATABASE_URL to be configured.");
  }

  const rows = await database
    .select()
    .from(authCodes)
    .where(eq(authCodes.email, email))
    .orderBy(desc(authCodes.createdAt))
    .limit(1);

  const record = rows[0];
  const fail = async (message: string): Promise<never> => {
    if (record) {
      if (record.attempts + 1 >= MAX_ATTEMPTS) {
        await database.delete(authCodes).where(eq(authCodes.id, record.id));
      } else {
        await database
          .update(authCodes)
          .set({ attempts: record.attempts + 1 })
          .where(eq(authCodes.id, record.id));
      }
    }
    throw new Error(message);
  };

  if (!record) throw new Error("That code is not valid. Request a new one.");
  if (record.expiresAt.getTime() < Date.now()) {
    await database.delete(authCodes).where(eq(authCodes.email, email));
    throw new Error("That code has expired. Request a new one.");
  }
  const candidate = hmac(`${email}:${code}`);
  const a = Buffer.from(candidate);
  const b = Buffer.from(record.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return fail("That code is not correct.");
  }

  await database.delete(authCodes).where(eq(authCodes.email, email));
  const user = await findOrCreateUser(database, email, undefined, "email");
  return { token: signToken(user), user };
}

/** Look up an account (used by the Google flow after the identity is proven). */
export async function upsertExternalUser(
  email: string,
  profile: { name?: string | null; avatarUrl?: string | null },
): Promise<{ token: string; user: AuthUser }> {
  const database = getDb();
  if (!database) {
    throw new Error("Authentication requires DATABASE_URL to be configured.");
  }
  const user = await findOrCreateUser(database, email, profile, "google");
  return { token: signToken(user), user };
}

const NAME_MAX = 60;

/**
 * Change the display name (the one field the account holder owns). Returns a
 * fresh token because the name travels inside the JWT claims.
 */
export async function updateProfile(
  userId: string,
  patch: { name?: unknown },
): Promise<{ token: string; user: AuthUser }> {
  const database = getDb();
  if (!database) {
    throw new Error("Authentication requires DATABASE_URL to be configured.");
  }

  const rows = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  if (rows.length === 0) throw new Error("Account not found.");

  let name: string | null = rows[0]!.name;
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") throw new Error("That name is not valid.");
    const trimmed = patch.name.trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
    if (/[\u0000-\u001f]/.test(trimmed)) throw new Error("That name is not valid.");
    name = trimmed === "" ? null : trimmed;
  }

  const updated = await database
    .update(users)
    .set({ name })
    .where(eq(users.id, userId))
    .returning();
  const user = toAuthUser(updated[0] ?? rows[0]!);
  return { token: signToken(user), user };
}

// ─── Delivery ───────────────────────────────────────────────────────────────

async function deliverCode(
  email: string,
  code: string,
): Promise<"email" | "log"> {
  const subject = `${code} is your Social Scraper Hub code`;
  const html = `
    <p>Your sign-in code is</p>
    <p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p>
    <p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`;
  const text = `Your sign-in code is ${code}. It expires in 10 minutes.`;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    // Fallback: no mail credentials yet. The code goes to the server log so the
    // flow still works end to end (Render's log stream shows it).
    logger.warn(
      { email, code, reason: "BREVO_API_KEY not set" },
      "Verification code (not emailed — set BREVO_API_KEY to deliver by email)",
    );
    return "log";
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: process.env.EMAIL_FROM ?? "bigbouba85@gmail.com",
          name: process.env.EMAIL_FROM_NAME ?? "Social Scraper Hub",
        },
        to: [{ email }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn({ status: response.status, detail }, "Brevo rejected the code email");
      throw new Error("Could not send the code. Try again in a moment.");
    }
    logger.info({ email }, "Verification code sent");
    return "email";
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not send")) throw error;
    logger.warn({ err: error }, "Email delivery failed; falling back to the log");
    return "log";
  }
}
