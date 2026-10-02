import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/** User-level Apify configuration (platform enablement, credentials, followed accounts) */
export const apifyConfigs = pgTable(
  "apify_configs",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    /** Per-platform configuration as JSONB */
    platforms: jsonb("platforms").notNull().default('{}'),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("apify_configs_user_idx").on(t.userId)],
);

/** Subscribed sources (accounts/pages/channels the user follows) */
export const apifySources = pgTable(
  "apify_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // instagram, tiktok, x, facebook, reddit, linkedin
    username: text("username").notNull(),
    datasetId: text("dataset_id"),
    status: text("status").notNull().default("active"), // active | paused | error
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }),
    subscriberCount: integer("subscriber_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("apify_source_unique").on(t.userId, t.platform, t.username),
    index("apify_sources_user_idx").on(t.userId),
    index("apify_sources_platform_idx").on(t.platform),
  ],
);

/** Normalized posts from Apify collections */
export const apifyPosts = pgTable(
  "apify_posts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    url: text("url").notNull(),
    text: text("text"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    media: jsonb("media").notNull().default('[]'),
    metrics: jsonb("metrics").notNull().default('{}'),
    author: text("author"),
    authorHandle: text("author_handle"),
    username: text("username"),
    sourceKey: text("source_key"),
    sourceLabel: text("source_label"),
    sourceKind: text("source_kind"),
    isOfficial: integer("is_official").default(0),
    isNew: integer("is_new").default(0),
    mediaItems: jsonb("media_items"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("apify_post_unique").on(t.userId, t.platformPostId),
    index("apify_posts_user_idx").on(t.userId),
    index("apify_posts_platform_idx").on(t.platform),
    index("apify_posts_published_idx").on(t.publishedAt),
    index("apify_posts_source_key_idx").on(t.sourceKey),
  ],
);

/** Apify actor run history */
export const apifyRuns = pgTable(
  "apify_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    sourceId: text("source_id").references(() => apifySources.id, { onDelete: "set null" }),
    runId: text("run_id").notNull(),
    datasetId: text("dataset_id"),
    status: text("status").notNull(), // RUNNING | SUCCEEDED | FAILED | TIMED_OUT
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    index("apify_runs_user_idx").on(t.userId),
    index("apify_runs_platform_idx").on(t.platform),
    index("apify_runs_source_idx").on(t.sourceId),
    index("apify_runs_run_id_idx").on(t.runId),
  ],
);