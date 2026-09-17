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

- `actors/social-monitor/` is the unified Apify Actor. Its `platform` input selects the concerned collector (`instagram` or `reddit`); future platforms should add a handler here instead of creating another Actor. The Reddit handler reads from `sources` or `accounts` input field.
- The backend uses one running API server for all platform monitors. Instagram remains available under `/api/monitors/instagram`; Reddit is integrated under `/api/monitors/reddit`.
- `artifacts/api-server/src/services/redditMonitor.ts` and `routes/redditMonitors.ts` create in-memory Reddit monitors, start the unified Actor, ingest its dataset, and expose feed results.
- The deployed unified Actor is `qQh6zsNsdbR2FHnLO` (`social-monitor`, build 1.0.3). `APIFY_SOCIAL_MONITOR_ACTOR_ID` is configured in the local backend `.env`; Instagram falls back to `APIFY_INSTAGRAM_ACTOR_ID` only if the unified variable is absent.
- `artifacts/social-scraper/lib/redditMonitorApi.ts` and `AppContext.tsx` route Reddit refreshes through the backend, so the APK no longer fetches Reddit directly.
- `PostCard.tsx` keeps the feed fullscreen button separate from native video controls; the rotate control is shown only inside the custom fullscreen player, and closing it restores the device orientation.
- Settings `TagInput` commits a source/account when Enter or Return is pressed, in addition to comma/semicolon.
