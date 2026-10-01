import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/apiConfig';
import type { SubscriptionTier } from '@/types/subscription';

/**
 * The signed-in account: session token plus the profile the backend returns.
 *
 * The token is what every API call authenticates with, and `id` is the user id
 * sent to the backend (the owner account's id is `local-user`, which is what
 * keeps the feed, sources and subscriptions made before sign-in attached to
 * this account).
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  tier: SubscriptionTier;
}

export interface Session extends AuthUser {
  token: string;
}

const STORAGE_KEY = '@socialscraper/session';

let session: Session | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        session = raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        session = null;
      }
    })();
  }
  return loadPromise;
}

/** Restore the session at boot (idempotent). */
export async function loadSession(): Promise<Session | null> {
  await ensureLoaded();
  return session;
}

export async function saveSession(next: Session | null): Promise<void> {
  session = next;
  try {
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // A failed write only means the next launch starts signed out.
  }
}

/** Synchronous view for code that cannot await (payload builders). */
export function currentSession(): Session | null {
  return session;
}

export function currentUserId(): string | null {
  return session?.id ?? null;
}

/** Headers for a backend call; empty while signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!session) await ensureLoaded();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

// ─── Sign-in API ────────────────────────────────────────────────────────────

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : text;
    throw new Error(detail || `Sign-in request failed (${response.status}).`);
  }
  return parsed as T;
}

/**
 * Ask the backend to email a 6-digit code. `delivery` tells the code screen
 * whether to look for an email ('email') or read the code from the backend log
 * ('log' — what happens until BREVO_API_KEY is configured).
 */
export async function requestCode(email: string): Promise<{
  delivery: 'email' | 'log';
  expiresInSec: number;
}> {
  return authRequest('/api/auth/request-code', { email });
}

/** Exchange a code for a session; throws with the backend's message. */
export async function verifyCode(email: string, code: string): Promise<Session> {
  const data = await authRequest<{ token: string; user: AuthUser }>(
    '/api/auth/verify-code',
    { email, code },
  );
  const next: Session = { ...data.user, token: data.token };
  await saveSession(next);
  return next;
}

/** Identify a token minted by another flow (the Google round-trip). */
export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await response.json().catch(() => ({}))) as { user?: AuthUser };
  if (!response.ok || !data.user) {
    throw new Error('That sign-in could not be verified. Try again.');
  }
  return data.user;
}

/** Which social sign-in buttons the backend can actually complete. */
export async function fetchProviders(): Promise<{ google: boolean }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/providers`);
    if (!response.ok) return { google: false };
    return (await response.json()) as { google: boolean };
  } catch {
    return { google: false };
  }
}

/** Backend-built Google authorization URL (staged until credentials exist). */
export async function fetchGoogleAuthUrl(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/auth/google/auth-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!response.ok || !data.url) {
    throw new Error(data.error ?? 'Google sign-in is not available yet.');
  }
  return data.url;
}
