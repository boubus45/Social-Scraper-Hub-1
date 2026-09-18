import { Actor, log } from "apify";
import { PlaywrightCrawler, sleep } from "crawlee";

interface Input {
  pages: string[];
  limit?: number;
  maxPostsPerPage?: number;
  onlyNew?: boolean;
  monitorId: string;
}

interface FacebookRecord {
  platform: "facebook";
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

const MAX_PAGES = 10;
const MAX_POSTS = 20;

function normalizePage(value: string): string {
  return value.trim().replace(/^@/, "").replace(/^.*facebook\.com\//i, "").split("/")[0].toLowerCase();
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function runFacebook(input: Input): Promise<void> {
  const pages = [...new Set((input.pages ?? []).map(normalizePage))].filter(p => /^[a-zA-Z0-9._]{1,50}$/.test(p)).slice(0, MAX_PAGES);
  if (pages.length === 0) throw new Error("No valid Facebook pages supplied.");

  const maxPosts = Math.min(Math.max(input.maxPostsPerPage ?? 5, 1), MAX_POSTS);
  const found: FacebookRecord[] = [];

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: pages.length,
    requestHandlerTimeoutSecs: 120,
    maxConcurrency: 1,
    requestHandler: async ({ page, request, log }) => {
      const username = request.userData.username as string;
      
      try {
        log.info(`Navigating to ${request.url}`);
        await page.goto(request.url, { waitUntil: "networkidle", timeout: 60000 });
        await sleep(5000);

        // Debug: log page title and URL
        const title = await page.title();
        const url = page.url();
        log.info(`Page loaded: "${title}" at ${url}`);
        
        // Debug: save screenshot for troubleshooting
        await page.screenshot({ path: `/tmp/fb_${username}.png` });
        log.info(`Screenshot saved: /tmp/fb_${username}.png`);
        
        // Debug: log page content length
        const content = await page.content();
        log.info(`Page content length: ${content.length} chars`);
        if (content.includes("Log In") || content.includes("login")) {
          log.warning(`Login wall detected for ${username}`);
        }

        // Extract posts using multiple strategies
        const extracted = await page.evaluate((maxP) => {
          const results: Array<{ text: string; url: string; media: string[]; timestamp?: string }> = [];
          
          // Strategy 1: Look for article elements (Facebook's structure)
          const articles = document.querySelectorAll('[role="article"]');
          log.info(`Found ${articles.length} article elements`);
          
          for (const article of articles) {
            if (results.length >= maxP) break;
            
            // Get text from the article
            const textEl = article.querySelector('[data-ad-preview="message"]') || 
                          article.querySelector('div[dir="auto"]') ||
                          article.querySelector('.x1iorvi4') ||
                          article.querySelector('.x193iq5u') ||
                          article.querySelector('span');
            const text = textEl?.textContent ?? "";
            if (text.length < 10) continue;
            
            // Get post URL
            let postUrl = "";
            const link = article.querySelector('a[href*="/posts/"]') || 
                        article.querySelector('a[href*="/permalink/"]') ||
                        article.querySelector('a[href*="story_fbid"]');
            if (link) postUrl = (link as HTMLAnchorElement).href;
            
            // Get media
            const media: string[] = [];
            article.querySelectorAll('img').forEach(img => {
              if (img.src && img.src.includes("fbcdn") && !img.src.includes("profile")) {
                media.push(img.src);
              }
            });
            
            if (text && !results.some(r => r.text === text)) {
              results.push({ text: cleanText(text), url: postUrl, media });
            }
          }
          
          // Strategy 2: Look for specific div patterns
          if (results.length === 0) {
            const divs = document.querySelectorAll('div.x1iorvi4, div.x193iq5u, div[data-ad-preview="message"]');
            log.info(`Strategy 2: Found ${divs.length} divs`);
            for (const div of divs) {
              if (results.length >= maxP) break;
              const text = div.textContent ?? "";
              if (text.length > 10 && !results.some(r => r.text === text)) {
                results.push({ text: cleanText(text), url: "", media: [] });
              }
            }
          }
          
          return results;
        }, maxPosts);

        for (const item of extracted) {
          const media: Array<{ type: "image" | "video"; url: string }> = item.media.map(url => ({ 
            type: "image" as const, 
            url 
          }));

          found.push({
            platform: "facebook",
            account: { username },
            post: {
              id: item.url.split("/").pop()?.split("?")[0] || `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              url: item.url || `https://facebook.com/${username}`,
              text: item.text,
              publishedAt: undefined,
              media,
            },
            metrics: { likes: 0, comments: 0, shares: 0, views: 0 },
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

  await crawler.run(pages.map((username) => ({
    url: `https://www.facebook.com/${username}/`,
    userData: { username },
  })));

  log.info(`Total Facebook posts collected: ${found.length}`);
  await Actor.setValue("SUMMARY", { monitorId: input.monitorId, pages, returned: found.length });
}

function parseFacebookDate(value: string): string | undefined {
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  
  const parts = value.toLowerCase().trim().split(/\s+/);
  if (parts.length >= 3) {
    const month = months[parts[0]];
    const day = parseInt(parts[1].replace(",", ""), 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day).toISOString();
    }
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
}

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { pages: [], monitorId: "missing" };
await runFacebook(input);
await Actor.exit();
