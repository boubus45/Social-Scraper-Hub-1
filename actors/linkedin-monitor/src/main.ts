import { Actor, log } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  accounts: string[];
  maxPostsPerAccount?: number;
  onlyNew?: boolean;
  monitorId: string;
  cookies?: string; // LinkedIn session cookies (li_at, JSESSIONID, etc.)
}

interface LinkedInRecord {
  platform: "linkedin";
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
  // LinkedIn profiles can be /in/username or /company/name
  const trimmed = value.trim().replace(/^@/, "");
  if (trimmed.includes("linkedin.com")) {
    const match = trimmed.match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
    if (match) return match[2].toLowerCase();
  }
  return trimmed.toLowerCase();
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
        domain: ".linkedin.com",
        path: "/",
        secure: true,
        httpOnly: ["li_at", "JSESSIONID"].includes(name),
      });
    }
  }
  
  return cookies;
}

async function runLinkedInMonitor(input: Input): Promise<void> {
  const accounts = [...new Set((input.accounts ?? []).map(normalizeUsername))]
    .filter((account) => /^[a-zA-Z0-9_-]{1,100}$/.test(account))
    .slice(0, MAX_ACCOUNTS);
  if (accounts.length === 0) throw new Error("No valid LinkedIn accounts were supplied.");

  const maxPosts = Math.min(Math.max(input.maxPostsPerAccount ?? 5, 1), MAX_POSTS);
  const found: LinkedInRecord[] = [];
  
  // Parse cookies from input
  const cookies = input.cookies ? parseCookies(input.cookies) : [];
  const hasAuth = cookies.length > 0;

  if (!hasAuth) {
    log.warning("No LinkedIn cookies provided. Results will be very limited due to login walls.");
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

        const profileUrl = `https://www.linkedin.com/in/${username}/recent-activity/all/`;
        log.info(`Navigating to ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(5000);

        // Check for login wall
        const content = await page.content();
        if (content.includes("Sign in") || content.includes("Join now")) {
          if (!hasAuth) {
            log.error(`Login wall detected for ${username}. No cookies provided.`);
            return;
          }
          log.warning(`Login wall detected for ${username}. Cookies may be expired/invalid.`);
        }

        // Scroll to load more posts
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await sleep(2000);
        }

        // Extract posts
        const extracted = await page.evaluate((maxP) => {
          const results: Array<{ 
            id: string; 
            text: string; 
            url: string; 
            publishedAt?: string; 
            media: string[]; 
            metrics: { likes: number; comments: number; shares: number; views: number };
          }> = [];
          
          // LinkedIn feed posts
          const posts = document.querySelectorAll('[data-urn^="urn:li:activity:"]');
          
          for (const post of posts) {
            if (results.length >= maxP) break;
            
            const urn = post.getAttribute("data-urn") || "";
            const postId = urn.replace("urn:li:activity:", "") || `li_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            // Get text content
            const textEl = post.querySelector('[data-test-id="main-feed-activity-card__commentary"]') ||
                          post.querySelector('.feed-shared-text') ||
                          post.querySelector('.update-components-text');
            const text = textEl?.textContent?.trim() ?? "";
            if (text.length < 1) continue;
            
            // Get post URL
            const linkEl = post.querySelector('a[href*="/feed/update/"]') ||
                          post.querySelector('a[href*="/posts/"]');
            const postUrl = linkEl ? (linkEl as HTMLAnchorElement).href : `https://www.linkedin.com/feed/update/${urn}/`;
            
            // Get timestamp
            const timeEl = post.querySelector('time');
            const publishedAt = timeEl?.getAttribute("datetime") ?? undefined;
            
            // Get media
            const media: string[] = [];
            post.querySelectorAll<HTMLImageElement>('img[src*="media.licdn.com"]').forEach(img => {
              if (img.src && !media.includes(img.src)) media.push(img.src);
            });
            post.querySelectorAll<HTMLVideoElement>('video').forEach(video => {
              if (video.src && !media.includes(video.src)) media.push(video.src);
            });
            
            // Get metrics (likes, comments, shares)
            const metrics = { likes: 0, comments: 0, shares: 0, views: 0 };
            
            // Look for social counts
            const socialCounts = post.querySelectorAll('.social-counts-reactions__count, .social-counts__count, [data-test-social-count]');
            socialCounts.forEach((el, idx) => {
              const val = parseInt(el.textContent?.replace(/,/g, "") || "0", 10);
              if (idx === 0) metrics.likes = val;
              else if (idx === 1) metrics.comments = val;
              else if (idx === 2) metrics.shares = val;
            });
            
            results.push({ 
              id: postId, 
              text, 
              url: postUrl, 
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
            platform: "linkedin",
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
              shares: item.metrics.shares, 
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
    url: `https://www.linkedin.com/in/${username}/recent-activity/all/`,
    userData: { username },
  })));

  log.info(`Total LinkedIn posts collected: ${found.length}`);
  await Actor.setValue("SUMMARY", { monitorId: input.monitorId, accounts, returned: found.length });
}

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { accounts: [], monitorId: "missing" };
await runLinkedInMonitor(input);
await Actor.exit();