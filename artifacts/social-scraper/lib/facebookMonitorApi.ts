import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlatformId, Post } from "@/types";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL
  ?? "https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api"
).replace(/\/+$/, "").replace(/\/api$/, "");
const MONITOR_ID_KEY = "@socialscraper/facebook-monitor-id";

interface Record {
  platform: "facebook";
  account: { username: string; displayName?: string };
  post: { id: string; url: string; text: string; publishedAt?: string; media: Array<{ type: "image" | "video"; url: string }> };
  metrics: { likes: number; comments: number; shares: number; views: number };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      // Preserve non-JSON backend errors.
    }
    throw new Error(`Backend request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.json() as Promise<T>;
}

function toPost(record: Record): Post {
  return {
    id: `facebook_${record.post.id}`,
    platform: "facebook" as PlatformId,
    author: record.account.displayName || record.account.username,
    authorHandle: `@${record.account.username}`,
    content: record.post.text,
    timestamp: record.post.publishedAt ?? new Date().toISOString(),
    url: record.post.url,
    likes: record.metrics.likes,
    comments: record.metrics.comments,
    media: record.post.media.map(item => item.url),
    mediaItems: record.post.media,
    sourceKey: `facebook:account:${record.account.username}`,
    sourceLabel: `@${record.account.username}`,
    sourceKind: "account",
  };
}

export async function refreshFacebookMonitor(
  pages: string[],
  existingMonitorId?: string,
  retrying = false,
  cookies?: string,
): Promise<{ monitorId: string; posts: Post[] }> {
  const normalizedPages = [...new Set(pages
    .map(p => p.trim().replace(/^@/, "").replace(/^.*facebook\.com\//i, "").split("/")[0].toLowerCase())
    .filter(Boolean))];
  if (normalizedPages.length === 0) {
    throw new Error("Add at least one Facebook page before refreshing.");
  }

  const payload = { userId: "local-user", pages: normalizedPages, limit: 10, enabled: true };
  let monitor: { id: string };
  if (existingMonitorId) {
    try {
      monitor = (await request<{ monitor: { id: string } }>(
        `/api/monitors/facebook/${encodeURIComponent(existingMonitorId)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      )).monitor;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("(404)")) throw error;
      monitor = (await request<{ monitor: { id: string } }>("/api/monitors/facebook", {
        method: "POST", body: JSON.stringify(payload),
      })).monitor;
    }
  } else {
    monitor = (await request<{ monitor: { id: string } }>("/api/monitors/facebook", {
      method: "POST", body: JSON.stringify(payload),
    })).monitor;
  }

  await AsyncStorage.setItem(MONITOR_ID_KEY, monitor.id);
  try {
    const result = await request<{ posts: Record[] }>(
      `/api/monitors/facebook/${encodeURIComponent(monitor.id)}/run`,
      { method: "POST", body: JSON.stringify(cookies ? { cookies } : {}) },
    );
    return { monitorId: monitor.id, posts: result.posts.map(toPost) };
  } catch (error) {
    if (!retrying && error instanceof Error && error.message.includes("(404)")) {
      await AsyncStorage.removeItem(MONITOR_ID_KEY);
      return refreshFacebookMonitor(normalizedPages, undefined, true, cookies);
    }
    throw error;
  }
}

export { MONITOR_ID_KEY };
