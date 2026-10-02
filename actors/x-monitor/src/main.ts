import { Actor, log } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  accounts: string[];
  maxPostsPerAccount?: number;
  onlyNew?: boolean;
  monitorId: string;
  cookies?: string; // X session cookies (auth_token, ct0, twid, etc.)
}

interface XRecord {
  platform: "x";
  account: { username: string; displayName?: string; id?: string };
  post: {
    id: string;
    url: string;
    text: string;
    publishedAt?: string;
    media: Array<{ type: "image" | "video"; url: string }>;
  };
  metrics: { likes: number; comments: number; shares: number; views: number };
  monitorId: string;
}

const MAX_ACCOUNTS = 10;
const MAX_POSTS = 20;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseCookies(cookieStr: string): Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean }> {
  if (!cookieStr || typeof cookieStr !== "string") return [];
  
  const cookies: Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean }> = [];
  const pairs = cookieStr.split(";");
  
  for (const pair of pairs) {
    const trimmed = pair.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    
    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (name && value) {
      cookies.push({
        name,
        value,
        domain: ".x.com",
        path: "/",
        secure: true,
        httpOnly: ["auth_token", "ct0", "twid"].includes(name),
      });
    }
  }
  
  return cookies;
}

async function runXMonitor(input: Input): Promise<void> {
  const accounts = [...new Set((input.accounts ?? []).map(normalizeUsername))]
    .filter((account) => /^[a-zA-Z0-9_]{1,15}$/.test(account))
    .slice(0, MAX_ACCOUNTS);
  if (accounts.length === 0) throw new Error("No valid X accounts were supplied.");

  const maxPosts = Math.min(Math.max(input.maxPostsPerAccount ?? 5, 1), MAX_POSTS);
  const found: XRecord[] = [];
  
  // Parse cookies from input
  const cookies = input.cookies ? parseCookies(input.cookies) : [];
  const hasAuth = cookies.length > 0;

  if (!hasAuth) {
    log.warning("No X cookies provided. Results may be limited due to login walls.");
  }

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: accounts.length,
    requestHandlerTimeoutSecs: 120,
    maxConcurrency: 1,
    requestHandler: async ({ page, request, log }) => {
      const username = request.userData.username as string;
      
      try {
        // Set cookies if provided
        if (hasAuth && cookies.length > 0) {
          log.info(`Setting ${cookies.length} cookies for ${username}`);
          await page.context().addCookies(cookies);
        }

        const profileUrl = `https://x.com/${username}`;
        log.info(`Navigating to ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3000);

        // Check for login wall
        const content = await page.content();
        if (content.includes("Log in") || content.includes("Sign up")) {
          if (!hasAuth) {
            log.error(`Login wall detected for ${username}. No cookies provided.`);
            return;
          }
          log.warning(`Login wall detected for ${username}. Cookies may be expired/invalid.`);
        }

        // Extract posts from the page
        const extracted = await page.evaluate((maxP) => {
          const results: Array<{ 
            id: string; 
            text: string; 
            url: string; 
            publishedAt?: string; 
            media: string[]; 
            metrics: { likes: number; comments: number; retweets: number; views: number };
          }> = [];
          
          // Strategy 1: Look for article elements with data-testid="tweet"
          const tweets = document.querySelectorAll('article[data-testid="tweet"]');
          
          for (const tweet of tweets) {
            if (results.length >= maxP) break;
            
            // Get tweet text
            const textEl = tweet.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent ?? "";
            if (text.length < 1) continue;
            
            // Get tweet URL / ID
            let postUrl = "";
            let tweetId = "";
            const timeLink = tweet.querySelector('a[href*="/status/"]');
            if (timeLink) {
              postUrl = (timeLink as HTMLAnchorElement).href;
              const match = postUrl.match(/\/status\/(\d+)/);
              if (match) tweetId = match[1];
            }
            
            // Get timestamp
            const timeEl = tweet.querySelector('time');
            const publishedAt = timeEl?.getAttribute("datetime") ?? undefined;
            
            // Get media
            const media: string[] = [];
            tweet.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com"]').forEach(img => {
              if (img.src && !media.includes(img.src)) media.push(img.src);
            });
            tweet.querySelectorAll<HTMLVideoElement>('video').forEach(video => {
              if (video.src && !media.includes(video.src)) media.push(video.src);
            });
            
            // Get metrics
            const metrics = { likes: 0, comments: 0, retweets: 0, views: 0 };
            const likeBtn = tweet.querySelector('[data-testid="like"]');
            const replyBtn = tweet.querySelector('[data-testid="reply"]');
            const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
            const viewBtn = tweet.querySelector('[data-testid="app-text-transition-container"]');
            
            // Try to extract numbers from aria-labels or text content
            const extractNumber = (el: Element | null): number => {
              if (!el) return 0;
              const label = el.getAttribute("aria-label") || el.textContent || "";
              const match = label.match(/([\d,.]+)/);
              if (match) return parseFloat(match[1].replace(/,/g, ""));
              return 0;
            };
            
            metrics.likes = extractNumber(likeBtn);
            metrics.comments = extractNumber(replyBtn);
            metrics.retweets = extractNumber(retweetBtn);
            metrics.views = extractNumber(viewBtn);
            
            if (!tweetId) tweetId = `x_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            results.push({ 
              id: tweetId, 
              text, 
              url: postUrl || `https://x.com/${username}/status/${tweetId}`, 
              publishedAt,
              media, 
              metrics 
            });
          }
          
          return results;
        }, maxPosts);

        for (const item of extracted) {
          const media: Array<{ type: "image" | "video"; url: string }> = item.media.map(url => ({ 
            type: url.includes(".mp4") || url.includes("video") ? "video" as const : "image" as const, 
            url 
          }));

          found.push({
            platform: "x",
            account: { username },
            post: {
              id: item.id,
              url: item.url,
              text: item.text,
              publishedAt: item.publishedAt,
              media,
            },
            metrics: { 
              likes: item.metrics.likes, 
              comments: item.metrics.comments, 
              shares: item.metrics.retweets, 
              views: item.metrics.views 
            },
            monitorId: input.monitorId,
          });
          await Actor.pushData(found[found.length - 1]);
        }
        
        log.info(`Collected ${extracted.length} posts from ${username}`);
      } catch (error) {
        log.error(`Error processing ${username}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    failedRequestHandler: async ({ request, log }) => {
      log.error(`Request failed: ${request.url}`);
    },
  });

  await crawler.run(accounts.map((username) => ({
    url: `https://x.com/${username}`,
    userData: { username },
  })));

  log.info(`Total X posts collected: ${found.length}`);
  await Actor.setValue("SUMMARY", { monitorId: input.monitorId, accounts, returned: found.length });
}

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { accounts: [], monitorId: "missing" };
await runXMonitor(input);
await Actor.exit();