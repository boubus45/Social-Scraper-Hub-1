// Database schema — Drizzle ORM (PostgreSQL)
// Currently using in-memory implementation below; swap to Drizzle when DB is provisioned.

export {}; // placeholder — actual Drizzle schema when DATABASE_URL is set

/*
import { pgTable, text, integer, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

export const socialSources = pgTable("social_sources", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(), // 'instagram' | 'reddit' | 'x' | 'facebook' | 'linkedin'
  username: text("username").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  brightDataJobId: text("bright_data_job_id"),
  brightDataDatasetId: text("bright_data_dataset_id"),
  monitoringStatus: text("monitoring_status").notNull().default("active"), // 'active' | 'paused' | 'error'
  lastProcessedPostId: text("last_processed_post_id"),
  lastProcessedAt: timestamp("last_processed_at"),
  subscriberCount: integer("subscriber_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("source_platform_username_idx").on(t.platform, t.username),
]);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceId: text("source_id").notNull().references(() => socialSources.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("sub_user_source_idx").on(t.userId, t.sourceId),
]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => socialSources.id),
  platformPostId: text("platform_post_id").notNull(),
  url: text("url"),
  content: text("content"),
  media: text("media"), // JSON array of { type, url }
  metrics: text("metrics"), // JSON { likes, comments, shares, views }
  publishedAt: timestamp("published_at"),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("post_source_platform_id_idx").on(t.sourceId, t.platformPostId),
  index("post_published_idx").on(t.publishedAt),
]);
*/
