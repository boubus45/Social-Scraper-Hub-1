// Persisted state for the collection manager.
//
// Sources, subscriptions and collected posts live in Postgres when
// DATABASE_URL is set, and in an atomic JSON snapshot otherwise — either way a
// process restart no longer wipes the feed.

import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import type { CollectionSource, NormalizedPost } from "./brightDataCollection.ts";
import type { PlatformId } from "./brightDataDatasets.ts";

export interface PersistedState {
  sources: CollectionSource[];
  posts: Record<string, NormalizedPost[]>;
  subscriptions: Array<{ userId: string; sourceId: string }>;
}

export interface StateStore {
  readonly label: string;
  load(): Promise<PersistedState | null>;
  save(state: PersistedState): Promise<void>;
  close(): Promise<void>;
}

// ─── JSON snapshot (default) ──────────────────────────────────────────────

function fileStore(filePath: string): StateStore {
  return {
    label: `file:${filePath}`,
    async load() {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as PersistedState;
        if (!parsed || !Array.isArray(parsed.sources)) return null;
        return {
          sources: parsed.sources,
          posts: parsed.posts ?? {},
          subscriptions: parsed.subscriptions ?? [],
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return null;
        // A half-written or hand-edited file must not stop the server booting.
        console.warn(`[BrightData] Ignoring unreadable state file ${filePath}:`, error);
        return null;
      }
    },
    async save(state) {
      const tmp = `${filePath}.tmp`;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(state), "utf8");
      await fs.rename(tmp, filePath); // atomic: readers never see a partial file
    },
    async close() {
      /* nothing to release */
    },
  };
}

// ─── Postgres ─────────────────────────────────────────────────────────────

function sourceFromRow(row: typeof schema.socialSources.$inferSelect): CollectionSource {
  const source: CollectionSource = {
    id: row.id,
    platform: row.platform as PlatformId,
    username: row.username,
    datasetId: row.datasetId,
    canonicalUrl: row.canonicalUrl,
    status: row.status as CollectionSource["status"],
    subscriberCount: row.subscriberCount,
    createdAt: row.createdAt.toISOString(),
  };
  // Optional keys stay absent (as JSON drops them) so a round trip is faithful.
  if (row.collectorId) source.collectorId = row.collectorId;
  if (row.lastPostId) source.lastPostId = row.lastPostId;
  if (row.lastCollectedAt) source.lastCollectedAt = row.lastCollectedAt.toISOString();
  return source;
}

function postFromRow(row: typeof schema.posts.$inferSelect): NormalizedPost {
  const parse = <T>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const post: NormalizedPost = {
    platform: row.platform as PlatformId,
    username: row.username,
    platformPostId: row.platformPostId,
    url: row.url ?? "",
    text: row.content ?? "",
    media: parse(row.media, []),
    metrics: parse(row.metrics, {}),
  };
  if (row.publishedAt) post.publishedAt = row.publishedAt.toISOString();
  return post;
}

function postgresStore(connectionString: string): StateStore {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const db = drizzle(pool, { schema });

  return {
    label: "postgres",
    async load() {
      const [sourceRows, subscriptionRows, postRows] = await Promise.all([
        db.select().from(schema.socialSources),
        db.select().from(schema.subscriptions),
        db.select().from(schema.posts),
      ]);

      const posts: PersistedState["posts"] = {};
      for (const row of postRows) {
        (posts[row.sourceId] ??= []).push(postFromRow(row));
      }

      return {
        sources: sourceRows.map(sourceFromRow),
        posts,
        subscriptions: subscriptionRows.map(row => ({
          userId: row.userId,
          sourceId: row.sourceId,
        })),
      };
    },
    async save(state) {
      await db.transaction(async tx => {
        // Children first: posts and subscriptions reference social_sources.
        await tx.delete(schema.posts);
        await tx.delete(schema.subscriptions);
        await tx.delete(schema.socialSources);

        if (state.sources.length > 0) {
          await tx.insert(schema.socialSources).values(
            state.sources.map(source => ({
              id: source.id,
              platform: source.platform,
              username: source.username,
              canonicalUrl: source.canonicalUrl,
              datasetId: source.datasetId,
              collectorId: source.collectorId ?? null,
              status: source.status,
              lastPostId: source.lastPostId ?? null,
              lastCollectedAt: source.lastCollectedAt ? new Date(source.lastCollectedAt) : null,
              subscriberCount: source.subscriberCount,
              createdAt: new Date(source.createdAt),
            })),
          );
        }

        if (state.subscriptions.length > 0) {
          await tx.insert(schema.subscriptions).values(
            state.subscriptions.map(subscription => ({
              id: `${subscription.userId}:${subscription.sourceId}`,
              userId: subscription.userId,
              sourceId: subscription.sourceId,
            })),
          );
        }

        const postRows = Object.entries(state.posts).flatMap(([sourceId, collected]) =>
          collected.map(post => ({
            id: `${sourceId}:${post.platformPostId}`,
            sourceId,
            platform: post.platform,
            username: post.username,
            platformPostId: post.platformPostId,
            url: post.url || null,
            content: post.text || null,
            publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
            media: JSON.stringify(post.media),
            metrics: JSON.stringify(post.metrics),
          })),
        );
        if (postRows.length > 0) {
          await tx.insert(schema.posts).values(postRows);
        }
      });
    },
    async close() {
      await pool.end();
    },
  };
}

// ─── Selection ────────────────────────────────────────────────────────────

export function createStateStore(): StateStore {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) return postgresStore(connectionString);

  const file =
    process.env.BRIGHTDATA_STATE_FILE ?? path.resolve(process.cwd(), ".brightdata-state.json");
  return fileStore(file);
}
