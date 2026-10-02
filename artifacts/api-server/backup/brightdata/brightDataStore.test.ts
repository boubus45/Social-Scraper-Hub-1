// Persistence tests. The Postgres case runs only when DATABASE_URL points at a
// disposable database — it truncates the three tables it writes to.
//
// Run with `pnpm test` in artifacts/api-server (node --test, type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStateStore, type PersistedState } from "./brightDataStore.ts";

function sampleState(): PersistedState {
  const source = {
    id: "src_1",
    platform: "x" as const,
    username: "NASA",
    datasetId: "c_mumyczdc14w602ck3i",
    canonicalUrl: "https://x.com/NASA",
    status: "active" as const,
    lastPostId: "2104695667180380260",
    lastCollectedAt: "2026-09-29T17:56:34.361Z",
    subscriberCount: 2,
    createdAt: "2026-09-29T17:00:00.000Z",
  };

  return {
    sources: [source],
    posts: {
      [source.id]: [
        {
          platform: "x",
          username: "NASA",
          platformPostId: "2104695667180380260",
          url: "https://x.com/NASA/status/2104695667180380260",
          text: "Starliner update",
          publishedAt: "2026-09-28T22:12:00.000Z",
          media: [{ type: "image", url: "https://pbs.twimg.com/media/abc.jpg" }],
          metrics: { likes: 2000, comments: 85, shares: 235, views: 611600 },
        },
      ],
    },
    subscriptions: [{ userId: "user-1", sourceId: source.id }],
  };
}

async function tempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brightdata-state-"));
  return path.join(dir, "state.json");
}

test("a missing state file loads as null, not an error", async () => {
  const store = fileStore(await tempFile());
  assert.equal(await store.load(), null);
  await store.close();
});

test("the JSON snapshot survives a round trip", async () => {
  const store = fileStore(await tempFile());
  const state = sampleState();

  await store.save(state);
  const loaded = await store.load();

  assert.deepEqual(loaded, state);
  await store.close();
});

test("a corrupt state file is ignored instead of crashing the boot", async () => {
  const file = await tempFile();
  await fs.writeFile(file, "{ not json", "utf8");

  const store = fileStore(file);
  assert.equal(await store.load(), null);
  await store.close();
});

test("createStateStore prefers Postgres when DATABASE_URL is set", () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/scraperhub";
    assert.equal(createStateStore().label, "postgres");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test(
  "the Postgres store round-trips sources, posts and subscriptions",
  { skip: process.env.DATABASE_URL ? false : "DATABASE_URL not set" },
  async () => {
    const store = createStateStore();
    assert.equal(store.label, "postgres");

    const state = sampleState();
    // Whatever is already in the database belongs to the app: keep it and put
    // it back, so running the suite never wipes a live feed.
    const original = await store.load();
    try {
      await store.save(state);
      assert.deepEqual(await store.load(), state);

      // An empty save must clear the tables, not leave orphans behind.
      await store.save({ sources: [], posts: {}, subscriptions: [] });
      assert.deepEqual(await store.load(), { sources: [], posts: {}, subscriptions: [] });
    } finally {
      await store.save(original ?? { sources: [], posts: {}, subscriptions: [] });
      await store.close();
    }
  },
);

/** File store bound to an explicit path, so tests never touch the real snapshot. */
function fileStore(file: string) {
  const stateFile = process.env.BRIGHTDATA_STATE_FILE;
  const databaseUrl = process.env.DATABASE_URL;
  process.env.BRIGHTDATA_STATE_FILE = file;
  delete process.env.DATABASE_URL; // the selector prefers Postgres when set
  try {
    return createStateStore();
  } finally {
    if (stateFile === undefined) delete process.env.BRIGHTDATA_STATE_FILE;
    else process.env.BRIGHTDATA_STATE_FILE = stateFile;
    if (databaseUrl !== undefined) process.env.DATABASE_URL = databaseUrl;
  }
}
