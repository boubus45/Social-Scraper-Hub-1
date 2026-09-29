// Database schema — Drizzle ORM (PostgreSQL)
// Tables mirror the in-memory state of the Bright Data collection manager:
// sources (one per account being scraped), subscriptions (which app user wants
// them) and the posts collected for each source.

import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const socialSources = pgTable(
  "social_sources",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(), // 'instagram' | 'reddit' | 'x' | 'facebook' | 'linkedin' | 'tiktok'
    username: text("username").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    // Bright Data collection target: a marketplace dataset id (gd_…) or, for X,
    // a Scraper Studio scraper id (c_…).
    datasetId: text("dataset_id").notNull(),
    collectorId: text("collector_id"),
    status: text("status").notNull().default("active"), // 'active' | 'paused' | 'error'
    lastPostId: text("last_post_id"),
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }),
    subscriberCount: integer("subscriber_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_platform_username_idx").on(t.platform, t.username)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // `${userId}:${sourceId}`
    userId: text("user_id").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => socialSources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sub_user_source_idx").on(t.userId, t.sourceId)],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(), // `${sourceId}:${platformPostId}`
    sourceId: text("source_id")
      .notNull()
      .references(() => socialSources.id),
    platform: text("platform").notNull(),
    // Author of the post itself, which differs from the source on retweets.
    username: text("username").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    url: text("url"),
    content: text("content"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    media: text("media"), // JSON array of { type, url }
    metrics: text("metrics"), // JSON { likes, comments, shares, views }
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("post_source_platform_id_idx").on(t.sourceId, t.platformPostId),
    index("post_published_idx").on(t.publishedAt),
  ],
);
