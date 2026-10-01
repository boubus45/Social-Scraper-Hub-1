import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlatformId, Post } from "@/types";
import { API_BASE_URL } from "@/lib/apiConfig";
import { authHeaders, currentUserId } from "@/lib/authSession";

const MONITOR_ID_KEY = "@socialscraper/reddit-monitor-id";

interface Record {
  platform: "reddit";
  account: { username: string; displayName?: string };
  post: { id: string; url: string; text: string; publishedAt?: string; media: Array<{ type: "image" | "video"; url: string }> };
  metrics: { likes: number; comments: number; shares: number; views: number };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
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
    id: `reddit_${record.post.id}`,
    platform: "reddit" as PlatformId,
    author: record.account.displayName || record.account.username,
    authorHandle: record.account.username.startsWith("u/") ? record.account.username : `r/${record.account.username}`,
    content: record.post.text,
    timestamp: record.post.publishedAt ?? new Date().toISOString(),
    url: record.post.url,
    likes: record.metrics.likes,
    comments: record.metrics.comments,
    media: record.post.media.map(item => item.url),
    mediaItems: record.post.media,
    sourceKey: `reddit:${record.account.username}`,
    sourceLabel: record.account.displayName || record.account.username,
    sourceKind: record.account.username.startsWith("u/") ? "user" : "subreddit",
  };
}

export async function refreshRedditMonitor(
  accounts: string[],
  existingMonitorId?: string,
  retrying = false,
  credentials?: { clientId?: string; clientSecret?: string; username?: string; password?: string },
) {
  if (accounts.length === 0) throw new Error("Add at least one Reddit subreddit or user before refreshing.");
  const payload = {
    userId: currentUserId() ?? "local-user",
    accounts,
    limit: 10,
    enabled: true,
  };
  let monitor: { id: string };
  if (existingMonitorId) {
    try {
      monitor = (await request<{ monitor: { id: string } }>(
        `/api/monitors/reddit/${encodeURIComponent(existingMonitorId)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      )).monitor;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("(404)")) throw error;
      monitor = (await request<{ monitor: { id: string } }>("/api/monitors/reddit", {
        method: "POST", body: JSON.stringify(payload),
      })).monitor;
    }
  } else {
    monitor = (await request<{ monitor: { id: string } }>("/api/monitors/reddit", {
      method: "POST", body: JSON.stringify(payload),
    })).monitor;
  }
  await AsyncStorage.setItem(MONITOR_ID_KEY, monitor.id);
  try {
    const result = await request<{ posts: Record[] }>(
      `/api/monitors/reddit/${encodeURIComponent(monitor.id)}/run`,
      { method: "POST", body: JSON.stringify(credentials ? { credentials } : {}) },
    );
    return { monitorId: monitor.id, posts: result.posts.map(toPost) };
  } catch (error) {
    if (!retrying && error instanceof Error && error.message.includes("(404)")) {
      await AsyncStorage.removeItem(MONITOR_ID_KEY);
      return refreshRedditMonitor(accounts, undefined, true);
    }
    throw error;
  }
}

export { MONITOR_ID_KEY as REDDIT_MONITOR_ID_KEY };
