import { Actor } from "apify";

interface Input {
  sources: string[];
  limit?: number;
}

interface RedditListing {
  data?: {
    children?: Array<{ data?: Record<string, unknown> }>;
  };
}

function normalizeSource(value: string): { slug: string; isUser: boolean } {
  const trimmed = value.trim().replace(/^r\//i, "");
  const isUser = trimmed.toLowerCase().startsWith("u/");
  return { slug: isUser ? trimmed.slice(2) : trimmed, isUser };
}

function mediaFor(post: Record<string, unknown>): Array<{ type: "image" | "video"; url: string }> {
  const media: Array<{ type: "image" | "video"; url: string }> = [];
  const url = typeof post.url === "string" ? post.url : "";
  if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) {
    media.push({ type: "image", url });
  }
  const secureMedia = post.secure_media as { reddit_video?: { fallback_url?: string } } | undefined;
  const crosspost = (post.crosspost_parent_list as Record<string, unknown>[] | undefined)?.[0];
  const crosspostMedia = crosspost?.secure_media as { reddit_video?: { fallback_url?: string } } | undefined;
  const video = secureMedia?.reddit_video?.fallback_url ?? crosspostMedia?.reddit_video?.fallback_url;
  if (video) media.push({ type: "video", url: video });
  return media;
}

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { sources: ["programming"] };
const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
const redditBaseUrl = (process.env.REDDIT_BASE_URL ?? "https://www.reddit.com").replace(/\/$/, "");

for (const rawSource of [...new Set((input.sources ?? []).filter((source): source is string => typeof source === "string"))].slice(0, 10)) {
  const source = normalizeSource(rawSource);
  if (!/^[a-zA-Z0-9_]{1,50}$/.test(source.slug)) continue;
  const endpoint = source.isUser
    ? `${redditBaseUrl}/user/${encodeURIComponent(source.slug)}/submitted.json?raw_json=1&limit=${limit}`
    : `${redditBaseUrl}/r/${encodeURIComponent(source.slug)}/hot.json?raw_json=1&limit=${limit}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SocialScraperRedditMonitor/1.0",
    },
  });
  if (!response.ok) throw new Error(`Reddit ${source.isUser ? `u/${source.slug}` : `r/${source.slug}`} returned HTTP ${response.status}.`);
  const listing = (await response.json()) as RedditListing;
  for (const child of listing.data?.children ?? []) {
    const post = child.data;
    if (!post || post.stickied || post.over_18) continue;
    const id = typeof post.id === "string" ? post.id : "";
    const author = typeof post.author === "string" ? post.author : "[deleted]";
    const permalink = typeof post.permalink === "string" ? post.permalink : "";
    const content = typeof post.selftext === "string" && post.selftext.trim()
      ? post.selftext
      : typeof post.title === "string" ? post.title : "";
    if (!id || !content) continue;
    await Actor.pushData({
      platform: "reddit",
      account: { username: source.slug, displayName: source.isUser ? `u/${source.slug}` : `r/${source.slug}` },
      post: {
        id,
        url: `https://www.reddit.com${permalink}`,
        text: content,
        publishedAt: typeof post.created_utc === "number" ? new Date(post.created_utc * 1000).toISOString() : undefined,
        media: mediaFor(post),
      },
      metrics: {
        likes: typeof post.ups === "number" ? post.ups : 0,
        comments: typeof post.num_comments === "number" ? post.num_comments : 0,
        shares: 0,
        views: 0,
      },
      sourceKey: `reddit:${source.isUser ? "user" : "subreddit"}:${source.slug.toLowerCase()}`,
      sourceLabel: source.isUser ? `u/${source.slug}` : `r/${source.slug}`,
    });
  }
}

await Actor.exit();
