# Social Scraper Hub - Codebase Map

## Project Overview
**Social Scraper Hub** is a multi-platform social media content aggregator and composer application. It allows users to:
- Scrape/fetch posts from multiple social platforms (X/Twitter, Reddit, LinkedIn, Facebook, Instagram)
- View aggregated feeds
- Compose posts and auto-generate platform-specific variations using AI
- Schedule posts across multiple platforms

**Tech Stack:**
- Frontend: React Native + Expo (cross-platform mobile)
- Backend: Express.js + Node.js
- Database: PostgreSQL with Drizzle ORM
- API Generation: Orval (OpenAPI codegen)
- AI Integration: OpenAI, Anthropic, Google Gemini support

---

## Directory Structure

### Root Level
- `package.json` - Monorepo workspace configuration (pnpm)
- `pnpm-workspace.yaml` - Workspace definition
- `tsconfig.base.json` - Base TypeScript config
- `tsconfig.json` - Root TypeScript config

### `/lib` - Shared Libraries

#### `/lib/db` - Database Layer
**Purpose:** PostgreSQL schema, ORM setup, database utilities
- `drizzle.config.ts` - Drizzle ORM configuration
- `src/schema/index.ts` - Database table definitions (currently empty, template provided)
- `src/index.ts` - Database client exports
- **Key Dependencies:** drizzle-orm, pg, drizzle-zod

#### `/lib/api-spec` - API Specification
**Purpose:** OpenAPI spec definition for code generation
- `orval.config.ts` - Orval configuration for API code generation
- **Key Dependencies:** orval (generates TypeScript API clients from OpenAPI specs)

#### `/lib/api-zod` - Zod Schema Validation
**Purpose:** Generated Zod schemas for API validation
- `src/generated/api.ts` - Generated API definitions
- `src/generated/types/` - Generated type definitions (healthStatus.ts)
- `src/index.ts` - Exports for API schemas and types

#### `/lib/api-client-react` - React API Client
**Purpose:** Generated React Query hooks and API client
- `src/generated/api.ts` - Generated API client (React Query hooks)
- `src/generated/api.schemas.ts` - Generated Zod schemas
- `src/custom-fetch.ts` - Custom fetch implementation for API calls
- `src/index.ts` - Exports for React hooks and client
- **Key Dependencies:** @tanstack/react-query, Zod

---

### `/artifacts` - Main Application Artifacts

#### `/artifacts/social-scraper` - Main React Native App
**Purpose:** Primary mobile application built with Expo
**Structure:**
```
app/
  ├── (tabs)/              # Tab-based navigation
  │   ├── _layout.tsx      # Tab layout (Home, Compose, Settings)
  │   ├── index.tsx        # Feed screen
  │   ├── compose.tsx      # Compose new post screen
  │   └── settings.tsx     # Settings screen
  ├── _layout.tsx          # Root layout with providers (Query, AppContext, ErrorBoundary)
  ├── edit/[postId].tsx    # Edit/compose individual post
  ├── preview/index.tsx    # Preview & publish screen
  └── +not-found.tsx       # 404 handler
components/
  ├── ErrorBoundary.tsx    # Error boundary wrapper
  ├── ErrorFallback.tsx    # Error UI fallback
  ├── HeaderAvatar.tsx     # Profile avatar header component
  ├── HeaderLogo.tsx       # Logo header component
  ├── KeyboardAwareScrollViewCompat.tsx # Keyboard handling
  ├── PlatformBadge.tsx    # Platform indicator badge
  ├── PlatformPreviewCard.tsx # Preview card for platform-specific drafts
  ├── PlatformSelector.tsx # Multi-select platform chooser
  ├── PostCard.tsx         # Individual post display card
context/
  ├── AppContext.tsx       # Global app state (settings, posts, drafts)
hooks/
  ├── useColors.ts         # Theme color hook
constants/
  ├── colors.ts            # Color palette definitions
  ├── platforms.ts         # Platform definitions
lib/
  ├── platformPosters.ts   # Platform-specific posting logic
types/
  ├── index.ts             # Type definitions (see below)
scripts/
  ├── build.js             # Build script
server/
  ├── serve.js             # Local dev server
entry.js, babel.config.js, metro.config.js - Expo/React Native config
tsconfig.json - App TypeScript config
```

**Key Types** (from `/artifacts/social-scraper/types/index.ts`):
- `PlatformId` - Union type: 'x' | 'reddit' | 'linkedin' | 'facebook' | 'instagram'
- `PlatformSettings` - Stores credentials, API keys, fetch/post settings per platform
- `AISettings` - AI provider (OpenAI/Anthropic/Gemini), model, API key
- `Post` - Represents a fetched post from any platform
- `ComposedPost` - User-created post with platform-specific drafts
- `Draft` - Saved draft with optional scheduling
- `AITone` - Post rephrasing tone options

#### `/artifacts/api-server` - Backend API Server
**Purpose:** Express.js API backend
**Structure:**
```
src/
  ├── app.ts          # Express app setup (middleware, CORS, routing)
  ├── index.ts        # Server entry point
  ├── lib/
  │   └── logger.ts   # Pino logger configuration
  └── routes/
      ├── index.ts    # Route definitions
      └── health.ts   # Health check endpoint
```
**Key Features:**
- Express.js with CORS and JSON middleware
- Pino HTTP logging with custom serializers
- Modular route structure

#### `/actors/reddit-monitor` - Reddit Apify Actor
**Purpose:** Standalone Apify Actor for public subreddit and Reddit-user monitoring.
- `src/main.ts` fetches Reddit JSON listings, skips stickied/NSFW/empty posts, and emits normalized text/image/video records.
- `.actor/INPUT_SCHEMA.json` accepts `sources` (subreddit names or `u/<username>`) and an optional `limit` from 1 to 25.
- `Dockerfile`, `package.json`, and `tsconfig.json` define the Actor runtime.

#### `/artifacts/mockup-sandbox` - UI Component Sandbox
**Purpose:** Vite + React app showcasing UI components
**Structure:**
```
src/
  ├── components/ui/      # 70+ shadcn/ui components (button, dialog, form, etc.)
  ├── hooks/
  │   ├── use-mobile.tsx
  │   └── use-toast.ts
  ├── lib/utils.ts
  └── App.tsx, main.tsx
vite.config.ts
```
**Purpose:** Testing and developing UI components in isolation

### `/scripts` - Utility Scripts
```
src/
  └── hello.ts         # Example/utility script
```

---

## Key Architectural Patterns

### Global State Management
- **AppContext** (React Context) stores:
  - User profile (name, handle, avatar)
  - AI settings (provider, model, API key)
  - Platform settings (credentials, fetch/post toggles, followed accounts)
  - Fetch frequency preference
  - Feed posts and composed drafts

### Data Flow
1. **Fetch**: User configures platforms → API fetches posts → stored in AppContext
2. **Compose**: User creates post → generates platform-specific drafts using AI
3. **Preview**: User reviews drafts → selects platforms
4. **Publish**: Post sent to selected platforms via APIs

### Platform Support
All platforms support:
- API mode (token/credential-based)
- Manual mode (copy-paste/open-app)

**Platforms:**
- X (Twitter) - API ready
- Reddit - API ready
- LinkedIn - API ready
- Facebook - API ready
- Instagram - API ready

### AI Features
- **Rephrasing:** AI-generated platform-specific versions of posts
- **Tone options:** professional, casual, concise, expanded, engaging
- **Providers:** OpenAI, Anthropic, Google Gemini

---

## Important Files to Know

### Core Logic
- `/artifacts/social-scraper/context/AppContext.tsx` - Global state management
- `/artifacts/social-scraper/lib/platformPosters.ts` - Platform posting implementations
- `/artifacts/social-scraper/types/index.ts` - Type definitions (all model definitions)
- `/artifacts/social-scraper/app/_layout.tsx` - App initialization, provider setup

### UI Components
- `/artifacts/social-scraper/components/PostCard.tsx` - Feed post display with collapsed long captions, image/video media, fullscreen image close controls, and landscape video fullscreen control. **Updates:** videos pause when scrolled out of view (via FlatList visibility tracking), opening fullscreen does NOT auto-rotate (only rotate button does), closing fullscreen pauses the feed video, clicking caption opens full post detail (not toggle expand), removed "Instagram post" default caption, video-only posts show only the video (no static image).
- `/artifacts/social-scraper/components/PlatformPreviewCard.tsx` - Draft preview
- `/artifacts/social-scraper/components/PlatformSelector.tsx` - Platform multi-select
- `/artifacts/mockup-sandbox/src/components/ui/` - Reusable UI components

### API
- `/lib/api-spec/orval.config.ts` - API spec codegen config
- `/lib/api-zod/src/generated/api.ts` - Generated validation schemas
- `/artifacts/api-server/src/routes/index.ts` - API endpoint definitions
- `/actors/reddit-monitor/src/main.ts` - Reddit public JSON scraper and normalized Actor output

### Database
- `/lib/db/src/schema/index.ts` - Database schema definitions (extend here)
- `/lib/db/drizzle.config.ts` - ORM configuration

---

## Build Commands

**Workspace root:**
```bash
pnpm build                  # Build all packages
pnpm typecheck              # Type check all packages
pnpm typecheck:libs         # Type check only libs
```

**Social Scraper app:**
```bash
cd artifacts/social-scraper
pnpm dev                    # Dev server (Expo)
pnpm build                  # Production build
pnpm typecheck              # Type check
```

**API Server:**
```bash
cd artifacts/api-server
pnpm build                  # Compile TypeScript
```

**API Spec codegen:**
```bash
cd lib/api-spec
pnpm codegen                # Generate API types/client
```

---

## Dependencies Overview

**Shared dependencies:**
- `typescript@~5.9.3` - Type checking
- `zod@catalog:` - Schema validation (via catalog in pnpm)
- `drizzle-orm` - ORM
- `@tanstack/react-query` - Server state management

**Frontend (social-scraper):**
- `expo` - React Native framework
- `expo-router` - Navigation/routing
- `react-native` - UI framework
- `react-native-reanimated` - Animations
- `react-native-gesture-handler` - Touch handling
- `expo-image-picker` - Image selection

**Backend (api-server):**
- `express` - HTTP framework
- `cors` - Cross-origin middleware
- `pino-http` - HTTP logging
- `pg` - PostgreSQL client

---

## Common Edit Points

| Task | Files to Edit |
|------|---------------|
| Add new platform | `types/index.ts` (PlatformId), `constants/platforms.ts`, `lib/platformPosters.ts` |
| Add API endpoint | `artifacts/api-server/src/routes/`, regenerate with `pnpm codegen` |
| Modify UI screen | `artifacts/social-scraper/app/(tabs)/*.tsx` or `app/edit/[postId].tsx` |
| Modify feed posts | `artifacts/social-scraper/components/PostCard.tsx` (videos, captions, fullscreen, media display) |
| Change feed visibility | `artifacts/social-scraper/app/(tabs)/index.tsx` (FlatList `onViewableItemsChanged`) |
| Fix Reddit parsing | `artifacts/api-server/src/services/redditMonitor.ts` (RSS parsing, HTML stripping, image extraction) |
| Change app theme | `constants/colors.ts`, `hooks/useColors.ts` |
| Add database table | `lib/db/src/schema/index.ts` (use Drizzle), run `pnpm push` |
| Update validation | `lib/api-zod/src/generated/api.ts` or regenerate |
| Add global state | `context/AppContext.tsx` |
| Create reusable component | `artifacts/mockup-sandbox/src/components/ui/` then export from `/artifacts/social-scraper/` |

---

## Notes for Future Development

1. **Database schema** currently empty - define tables in `/lib/db/src/schema/index.ts`
2. **API endpoints** should be generated from OpenAPI spec via Orval
3. **Error handling** wrapped with ErrorBoundary component
4. **Async storage** available via `@react-native-async-storage/async-storage`
5. **Image handling** via `expo-image-picker` and `expo-image`
6. **Animations** powered by `react-native-reanimated`
7. **Monorepo** uses pnpm workspaces - install with `pnpm install`

---

**Last Updated:** 2026-09-17

## Current Instagram monitor integration

- `actors/instagram-monitor/` contains the deployed Apify Instagram Actor (build 1.0.12). It parses captions and image/video media, including carousel children and post-level video sources, from the public profile page and falls back to the public `/embed/` page when Instagram returns a login/challenge page.
- `artifacts/api-server/src/services/instagramMonitor.ts` enforces Free/Pro/Mega account, frequency, and post limits, starts the configured Actor, and ingests its dataset. Current monitor/feed storage is in-memory and is lost when the backend restarts.
- `artifacts/api-server/src/routes/instagramMonitors.ts` exposes monitor CRUD, manual run, feed, and webhook endpoints under `/api`.
- `artifacts/api-server/src/index.ts` loads backend environment variables with `dotenv`.
- Backend secrets belong in the gitignored file `artifacts/api-server/.env`:
  - `PORT`
  - `APIFY_API_TOKEN`
  - `APIFY_INSTAGRAM_ACTOR_ID`
- Never place the Apify token in the mobile app, APK, GitHub source, or user settings.
- `artifacts/social-scraper/lib/instagramMonitorApi.ts` calls the backend to create/update a Free Instagram monitor and trigger a synchronous Apify run from the mobile refresh flow. It maps normalized Actor records, including typed media items, to the app `Post` shape and retries once when a stale monitor/run ID returns 404.
- `artifacts/social-scraper/components/PostCard.tsx` renders Instagram captions, images, videos, post detail/image modals, and a See in app deep link.
- `artifacts/social-scraper/context/AppContext.tsx` routes Instagram refreshes through `refreshInstagramMonitor`; other legacy platform fetch paths remain separate.
- The mobile backend URL is compiled from `EXPO_PUBLIC_API_URL` when supplied, otherwise defaults to `https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api`. The helper removes a trailing `/api` before appending API paths.
- `.github/workflows/build-apk.yml` builds the APK on demand and on `main` pushes only when mobile/build-related paths change. Backend-only changes do not trigger an APK build.

## Unified social monitor integration

- `actors/social-monitor/` is the unified Apify Actor. Its `platform` input selects the concerned collector (`instagram` or `reddit`); future platforms should add a handler here instead of creating another Actor. The Reddit handler reads from `sources` or `accounts` input field and uses the public RSS feed (`.rss` endpoint) — Reddit blocks datacenter IPs on the JSON API.
- The backend uses one running API server for all platform monitors. Instagram remains available under `/api/monitors/instagram`; Reddit is integrated under `/api/monitors/reddit`.
- `artifacts/api-server/src/services/redditMonitor.ts` and `routes/redditMonitors.ts` create in-memory Reddit monitors, start the unified Actor, ingest its dataset, and expose feed results.
- The deployed unified Actor is `qQh6zsNsdbR2FHnLO` (`social-monitor`, build 1.0.3). `APIFY_SOCIAL_MONITOR_ACTOR_ID` is configured in the local backend `.env`; Instagram falls back to `APIFY_INSTAGRAM_ACTOR_ID` only if the unified variable is absent.
- `artifacts/social-scraper/lib/redditMonitorApi.ts` and `AppContext.tsx` route Reddit refreshes through the backend, so the APK no longer fetches Reddit directly.
- `PostCard.tsx` keeps the feed fullscreen button separate from native video controls; the rotate control is shown only inside the custom fullscreen player, and closing it restores the device orientation.

## Latest changes (2026-09-18)

### Clickable URLs in posts
- `artifacts/social-scraper/components/PostCard.tsx` parses URLs in post content and renders them as blue, tappable links using `Linking.openURL`. Detects `http://`, `https://`, and `www.` prefixed URLs.

### Full OAuth flow (fetch + post)
- **Backend:** `artifacts/api-server/src/services/oauthService.ts` — token storage, exchange, refresh per platform. Reads client IDs/secrets from env vars.
- **Backend:** `artifacts/api-server/src/routes/oauth.ts` — endpoints:
  - `GET /api/oauth/:platform/auth-url` — returns authorization URL (backend knows client_id, frontend doesn't)
  - `POST /api/oauth/:platform/callback` — exchanges code for token, stores it
  - `GET /api/oauth/:platform/status` — connection status
  - `DELETE /api/oauth/:platform` — disconnect
  - `POST /api/oauth/:platform/token` — get valid token (refreshes if needed, used by posting)
- **Backend:** `artifacts/api-server/src/services/platformPosters.ts` — server-side posting using stored tokens (Reddit, X, LinkedIn)
- **Backend:** `artifacts/api-server/src/routes/post.ts` — `POST /api/post/:platform` for scheduled post execution
- **Frontend:** `artifacts/social-scraper/app/(tabs)/settings.tsx` — updated `handleOAuthLogin` to use backend-driven auth URL, PKCE for Twitter, deep link redirect capture, token exchange via backend

### OAuth env vars needed per platform (in `artifacts/api-server/.env`)
- `REDDIT_OAUTH_CLIENT_ID` / `REDDIT_OAUTH_CLIENT_SECRET`
- `X_OAUTH_CLIENT_ID`
- `LINKEDIN_OAUTH_CLIENT_ID` / `LINKEDIN_OAUTH_CLIENT_SECRET`
- `FACEBOOK_OAUTH_CLIENT_ID` / `FACEBOOK_OAUTH_CLIENT_SECRET`
- `INSTAGRAM_OAUTH_CLIENT_ID` / `INSTAGRAM_OAUTH_CLIENT_SECRET`

### Facebook monitor actor
- `actors/facebook-monitor/` contains a dedicated Apify Actor (PlaywrightCrawler) that scrapes public Facebook pages. Deployed as `3GKIxiJareOmz3AKW`. Supports `cookies` input for session auth.

### Key new files
- `actors/facebook-monitor/src/main.ts`, `package.json`, `tsconfig.json`, `.actor/actor.json`, `.actor/INPUT_SCHEMA.json`, `Dockerfile`
- `artifacts/social-scraper/components/PostCard.tsx` — added `ClickableText` and `parseTextWithUrls` helpers
- `artifacts/social-scraper/app/(tabs)/settings.tsx` — updated `OAUTH_CONFIG`, `handleOAuthLogin`, `hasOAuthCredentials`, OAuth UI styles
- `artifacts/api-server/src/services/oauthService.ts` — token storage, exchange, refresh
- `artifacts/api-server/src/services/platformPosters.ts` — server-side posting with stored tokens
- `artifacts/api-server/src/routes/oauth.ts` — OAuth endpoints
- `artifacts/api-server/src/routes/post.ts` — posting endpoint

### How posting works now
1. User schedules a post in the app (compose → schedule for later)
2. AppContext `executeScheduledDraft` sends content + userId to backend
3. Backend looks up stored OAuth token → refreshes if needed → posts via platform API
4. Result returned to frontend, shown in alert

### Reddit OAuth credentials mode (alternative)
- `artifacts/api-server/src/services/redditMonitor.ts` — also accepts `clientId`/`clientSecret`/`username`/`password` via `startRedditRun(credentials)` for password grant (no browser OAuth needed)
- Frontend `AppContext.tsx` passes these from `PlatformSettings.credentials` on refresh

### Typecheck/build status
- `pnpm run typecheck` passes after these edits.
- `pnpm run build` passes for the api-server.

### Recent commit
- `ad50432` on main: feat: Reddit OAuth + Facebook cookie auth (includes all OAuth flow work).

### OAuth setup needed to make buttons functional
1. Register OAuth apps on each platform's developer console (X, Reddit, LinkedIn, Facebook, Instagram).
2. Set the redirect URI to match the app's deep link scheme.
3. Add the Client ID/Secret fields to the credentials section (already available below the OAuth button for Reddit; for X and LinkedIn you'd use the existing `clientId`/`clientSecret` keys; for Facebook/Instagram use the `cookies` field or add new fields).
4. A backend endpoint (not yet implemented) must exchange the authorization code for an access token and store it in `PlatformCredentials` per user.

### Typecheck/build status
- `pnpm run typecheck` passes after these edits.
- `pnpm run build` passes for the api-server.

### Recent commit
- `0a69c48` on main: feat: clickable URLs in posts + OAuth connect buttons in Settings (includes facebook-monitor actor files).

---

## Bright Data Integration (updated 2026-09-29)

### Architecture
- **Backend loop**: hourly collection + `POST /api/brightdata/collect/:platform/:username` on demand; both wait for Bright Data's snapshot (`/datasets/v3/snapshot/{id}`) or DCA dataset (`/dca/dataset?id=j_*`) rather than trusting delivery.
- **Restart catch-up**: `isSourceDue` gates every scheduled pass — the hourly tick *and* a pass 15 s after boot — so a process woken on a sleeping host collects what's overdue instead of idling for a full interval, and never pays twice for a scrape gathered less than an interval ago.
- **Persistence guard**: when the very first state load fails, `flushState` refuses to write. An empty process flushing on shutdown used to wipe a healthy Postgres (it actually happened once — the feed was rebuilt from scratch); losing this run's writes beats erasing what is stored.
- **Centralized sources**: one scrape per account, shared by every subscriber; subscribe/unsubscribe just moves a counter (`status` flips to `paused` at 0 subscribers).
- **Feed never scrapes**: the frontend only reads `GET /api/brightdata/feed`.
- **Webhooks now reachable**: port 3000 was opened with `gh codespace ports visibility 3000:public -c <codespace>` (a private port 302s to the GitHub sign-in page, which is why deliveries used to bounce). **Visibility reverts to private whenever the codespace restarts** — re-run that command after every wake. Verified live through the public URL: no secret → 401, `?secret=` → 200, and a real Bright Data delivery landed right after an Instagram collect. Polling snapshots stays the primary path; the webhook runs in parallel and is deduped, so both can deliver the same batch safely.
- **Apify**: Reddit (no Bright Data dataset exists).

### Platform Datasets (all verified live against the API)

| Platform | Target | Method | Trigger verified |
|----------|--------|--------|------------------|
| Instagram | `gd_l1vikfch901nx3by4` | dataset `/datasets/v3/trigger` | ✅ (12 posts) |
| LinkedIn | `gd_l1viktl72bvl7bjuj0` | dataset | ✅ |
| TikTok | `gd_l1villgoiiidt09ci` | dataset | ✅ |
| Facebook | `gd_lkaxegm826bjpoo9m5` | dataset | ✅ (old `gd_lfqk7jkk2582box2zn` rejects `/trigger`) |
| X | `c_mumyczdc14w602ck3i` | Scraper Studio scraper (DCA) | ✅ (20 unique posts / 38s) |
| Reddit | *none* | Apify actor | N/A |

- X: no marketplace dataset accepts a profile URL — `gd_lhqdbl2k1adkkc5tss` answers "does not support collection", `gd_lwxkxvnf1cynvib9co` wants single status URLs. Hence the scraper, created via API:
  1. `POST /dca/collector` → `c_mumyczdc14w602ck3i` ("social-x-profile-posts")
  2. `POST /dca/collectors/{id}/automate_template` (AI flow, status `preview_picker` → `done`)
  3. `POST /dca/trigger?collector={id}` with `[{"url":"https://x.com/NASA"}]` → `collection_id` = `j_*`
  - **`queue_next=1` must be omitted** — trial collectors reject queued jobs.
- Bright Data MCP (`https://mcp.brightdata.com/sse?token=…&groups=advanced_scraping,social`) is configured in `.mcp.json`. It exposes only `ask_brightdata_assistant` (Q&A, times out), `search_engine`, `scrape_as_markdown`, `search_engine_batch`, `scrape_batch` — no scraper-creation tool, so creation went through the REST API above.

### Key Files (`artifacts/api-server/src`)
- `services/brightDataCollection.ts` — subscription/collection manager, dedup, persistence hooks
- `services/brightDataNormalize.ts` — the one normalizer both ingest paths use
- `services/brightDataHttp.ts` — auth + `parseDatasetPayload` (array / object / concatenated docs / not-ready sentinels)
- `services/brightDataDatasets.ts` — dataset ids, `scraperId`, `supportsOnDemand`
- `services/brightDataStore.ts` — Postgres or JSON-snapshot persistence
- `services/brightDataUnified.ts` — on-demand profile fetch (IG/LI/TT)
- `routes/brightData.ts` — REST + `webhookRouter`
- `*.test.ts` — 31 tests (`pnpm test`, `node --test src/services/*.test.ts`)

### Endpoints (prefix matters — everything is mounted under `/api/brightdata`)
- `POST /api/webhooks/brightdata` — webhook (kept outside the prefix because `BRIGHTDATA_WEBHOOK_URL` hardcodes it)
- `POST /api/brightdata/sources` · `DELETE /api/brightdata/sources/:platform/:username` · `GET /api/brightdata/sources?userId=`
- `GET /api/brightdata/sources/all` · `GET /api/brightdata/feed?userId=`
- `GET /api/brightdata/profile/:platform?username=` · `GET /api/brightdata/platforms` · `GET /api/brightdata/status`
- `POST /api/brightdata/collect/:platform/:username` → `{ ok, postsCollected }` (`postsCollected` = posts actually added, not raw records — Bright Data paginates and duplicates)

### Normalization rules (learned from live payloads)
- Two shapes: **nested** profile records (`posts` for IG/LI/X, `top_posts_data` for TikTok) vs **flat** post records (Facebook). A record owning the key but with `[]` means "profile with no posts", not a post.
- X scraper returns `{posts:[{post_url, post_text, author_handle, posted_date, reply_count, repost_count, like_count, view_count, media_image_url, author_profile_image}]}` — handle comes from the *post*, not the wrapper; `author_profile_image` is an avatar and is dropped.
- X id = the numeric status id (stable across scrapes); URLs are stripped of `/photo/1`.
- X dates are UI strings (`"8:31 PM · Sep 25, 2026"`, `"Sep 25"`) → parsed to ISO; when `posted_date` is empty (retweets) the timestamp is recovered from the snowflake id (`(id >> 22) + 1288834974657`).
- Only classifiable media is kept, so `tiktok.com/@u/video/…` page links never become a broken player.
- LinkedIn `interaction` (`"2,530 - 139 Comments"`) → likes/comments; TikTok joins `top_videos` on `post_id == video_id` for cover + counts.
- Records without an id are skipped instead of collapsing into one shared `"undefined"` post.

### Persistence
- `DATABASE_URL` set → Postgres (`social_sources`, `subscriptions`, `posts`, created with `pnpm run push` in `lib/db`); otherwise an atomic JSON snapshot at `BRIGHTDATA_STATE_FILE` (default `.brightdata-state.json`, gitignored).
- Restored on boot before the server listens, debounced (1s) writes on every mutation, explicit flush on SIGINT/SIGTERM. Cap: 200 newest posts per source.
- `lib/db/src/schema/social.ts` is now the live Drizzle schema (was commented out).
- Local dev DB provisioned for testing: PostgreSQL 17, role `app`, db `scraperhub`, `DATABASE_URL` in the gitignored `.env`.
- The Postgres test snapshots and restores existing rows, so running the suite never wipes a live feed.

### Webhook auth
`BRIGHTDATA_WEBHOOK_SECRET` in `.env` (`openssl rand -hex 24`) accepted three ways: `Authorization: Bearer <secret>`, `x-webhook-secret` header, or `?secret=` on the delivery URL. Body may be an array or a scraper-style `{posts:[…]}`; empty batches count as `skipped`, not errors. `getWebhookUrl` appends `?source_id=…&dataset_id=…&secret=…` to every trigger's `endpoint=`, and deliveries are logged as `[BrightData] Webhook delivery source=… ingested=… duplicates=…`.

### Feed UI (`artifacts/social-scraper`)
- Filter chips: **New (default)** → only the posts each platform's *last fetch* brought in, grouped by platform, and platforms with nothing new are omitted entirely; **All** → the original "everything, separated by platform" view; then one chip per enabled platform (with a colored dot when that platform has new posts).
- Platform sections are ordered by each platform's freshest post rather than the fixed platform list, so the newest platform is never below the scroll.
- `isNew` is set during merge (only ids the previous fetch had not seen) and now **persists across restarts** — hydration used to clear it, which would have emptied the default view after an app relaunch.
- Settings' "Auto-fetch frequency" is gone (`FetchFrequency` / `FETCH_FREQUENCY_LABELS` / `AppSettings.fetchFrequency` deleted; hydration drops any stored copy). The backend collects hourly, so Settings shows an explanatory hint about the plan-driven cadence instead of a control.
- A newly subscribed source fires an immediate collect for **every** Bright Data platform (X and Facebook included now that X runs the scraper and FB's dataset accepts `/trigger`).
- **Refresh cadence comes from the plan**, not a fixed timer: `types/subscription.ts` sets `minScrapeInterval` per tier — Free **daily**, Pro **6h**, Mega Pro **1h** (`'3h'` exists in the type but no tier uses it) — surfaced on `AppSettings.subscriptionTier` (default `free`). Every fetch schedules its successor at that pace, the last-fetch time is persisted (`@socialscraper/lastFetchAt`) so the interval survives restarts, and every trigger (plan timer, cold launch, foreground return) passes one `refreshAllowed()` gate with a 60 s floor.
- **Testing switch**: `INSTANT_FEED_REFRESH = true` in `context/AppContext.tsx` returns 0 ms for every plan, arms no timer at all, and lets *all* plans refresh the moment the app opens — flip it to `false` to enforce plan cadences again.
- **No manual refresh**: pull-to-refresh and the header refresh button were removed from the Feed screen; opening the app (or returning to the foreground) is the refresh. Bright Data backend collection stays **hourly**, whatever the plan.
- **Notifications** (`lib/notifications.ts`, `expo-notifications`): a fetch that discovers unseen post IDs raises one local notification per platform — `Instagram · New post from nasa` — with the post text as the body; permission is requested lazily on the first one, taps open the Feed, and the foreground handler shows banners too. `expo-notifications` is a dependency and an `app.json` plugin; its library manifest supplies `POST_NOTIFICATIONS`, confirmed via `expo prebuild` + `expo-modules-autolinking resolve --platform android`.

### Config (`.env`, see `.env.example`)
`BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_WEBHOOK_URL`, `BRIGHTDATA_WEBHOOK_SECRET`, `DATABASE_URL`, `BRIGHTDATA_STATE_FILE`.

### Status
- `pnpm run typecheck` ✅ (4 projects) · `pnpm test` ✅ 31/31 with `DATABASE_URL` · api-server `pnpm build` ✅ · the Expo app bundles on Metro ✅ (iOS 1749 / Android 1884 modules, notifications included; no desktop browser attached for a visual pass)
- Live E2E ✅: boot catch-up collected 2/2 sources on restart, feed back to 32 posts across X + Instagram, persisted to Postgres, public webhook answers 401/200 correctly.
### Hosting: Render + Neon (live since 2026-09-30)
- **Render** free web service `social-scraper-hub` — `srv-daum5t0jo6nc73dnqfmg`, https://social-scraper-hub.onrender.com, Singapore, workspace `tea-dauloj3tqb8s73s0`. Build: `(command -v pnpm >/dev/null 2>&1 || corepack enable || npm install -g pnpm@9.15.0) && NODE_ENV=development pnpm install --frozen-lockfile --filter @workspace/api-server... && pnpm --filter @workspace/api-server build`; start: `node artifacts/api-server/dist/index.mjs` (Render supplies `PORT`, which `src/index.ts` hard-requires). Auto-deploy is **off** — deploy with `render deploys create srv-daum5t0jo6nc73dnqfmg --wait --confirm`, or `POST /v1/services/<id>/deploys`.
- **Neon** free project `small-hill-92916276` (org `org-spring-feather-14921064`, region `aws-ap-southeast-1`). Direct connection string kept at `~/.agent-neon-db-url`; schema created with `DATABASE_URL="$(cat ~/.agent-neon-db-url)" pnpm --filter @workspace/db push`. `?sslmode=require` parses to `ssl:{}` in pg-connection-string 2.14 and the extra `channel_binding=require` is ignored, so no driver change was needed.
- **Env vars** were set in one shot with `PUT /v1/services/<id>/env-vars` and a JSON file (`-d @file`), so values never appear in a command: `DATABASE_URL`, `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_WEBHOOK_SECRET`, `BRIGHTDATA_WEBHOOK_URL=https://social-scraper-hub.onrender.com/api/webhooks/brightdata`, `APIFY_API_TOKEN`, `APIFY_*_ACTOR_ID`, `NODE_ENV=production`.
- **Gotcha that failed three builds**: Render passes service env vars into the *build command*, and `NODE_ENV=production` makes pnpm skip devDependencies → `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from build.mjs` about 10 s in. The first deploy only succeeded because `NODE_ENV` was written after it had started. Fixed by prefixing the install with `NODE_ENV=development`. Diagnosis route: `GET /v1/logs?ownerId=<workspace>&resource=<serviceId>&type=build` — there is **no** per-deploy log endpoint (`/deploys/<id>/logs` returns `404 page not found`), and `render deploys create --confirm` does not stream logs unless interactive.
- **CLIs installed in the codespace**: `neon` 7.0.1 (auth via `NEON_API_KEY`; pass `--org-id org-spring-feather-14921064` or it prompts for the org) and `render` v2.28.0 (release binary in `~/.local/bin`, auth via `RENDER_API_KEY`, workspace set by name — by ID 404s). Both keys live in `~/.agent-env.sh` (chmod 600, sourced from `~/.bashrc`), outside the repo; the user can revoke them.
- **App → host wiring**: the Gradle step inlines `EXPO_PUBLIC_API_URL: ${{ vars.EXPO_PUBLIC_API_URL || 'https://social-scraper-hub.onrender.com' }}`. The repository variable could not be created from here (the `gh` token is an App user token without `actions:write`) — override it in Settings → Secrets and variables → Actions → Variables, or with `gh variable set EXPO_PUBLIC_API_URL --body …` from a token that has that scope. `lib/apiConfig.ts` treats empty/whitespace as missing, so an unset variable can never yield a relative URL.
- **Verified E2E on Render**: `/api/brightdata/status` → `configured:true`; sources seeded (`x/NASA`, `instagram/nasa`); collect → 20 + 11 posts; feed → 32 posts; webhook 401 without the secret and 200 with it. The codespace is now redundant and can be stopped entirely.
- Free-tier behaviour: Render sleeps after ~15 min idle (first request ≈ 30-60 s) and the boot catch-up collects overdue sources on wake; Neon free = 0.5 GB and scales to zero.
