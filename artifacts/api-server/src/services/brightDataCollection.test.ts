// Tests for the Bright Data collection manager (sources, subscriptions,
// webhook ingestion, deduplication, feed ordering).
//
// Run with `pnpm test` in artifacts/api-server. Node 22 loads these .ts files
// directly via type stripping, which is why relative imports keep their `.ts`
// extension inside this dependency chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  subscribeToSource,
  unsubscribeFromSource,
  getSubscribedSources,
  getUserFeed,
  ingestWebhookPayload,
  posts,
} from "./brightDataCollection.ts";
import { getDatasetForPlatform } from "./brightDataDatasets.ts";

const suffix = () => Math.random().toString(36).slice(2, 8);
// Every test gets its own users: module state is shared for the whole process.
const userId = () => `user_${suffix()}`;

test("subscribeToSource creates a source with its Bright Data dataset", () => {
  const user = userId();
  const username = `ig_user_${suffix()}`;
  const source = subscribeToSource(user, "instagram", username);

  assert.equal(source.platform, "instagram");
  assert.equal(source.username, username);
  assert.equal(source.datasetId, getDatasetForPlatform("instagram")!.id);
  assert.equal(source.canonicalUrl, `https://www.instagram.com/${username}/`);
  assert.equal(source.status, "active");
  assert.equal(source.subscriberCount, 1);
});

test("subscribing twice with the same user is idempotent", () => {
  const user = userId();
  const username = `ig_user_${suffix()}`;
  subscribeToSource(user, "instagram", username);
  const again = subscribeToSource(user, "instagram", username);

  assert.equal(again.subscriberCount, 1);
  assert.equal(getSubscribedSources(user).filter(s => s.username === username).length, 1);
});

test("a second user shares the same source instead of duplicating it", () => {
  const userA = userId();
  const userB = userId();
  const username = `ig_user_${suffix()}`;
  const first = subscribeToSource(userA, "instagram", username);
  const second = subscribeToSource(userB, "instagram", username);

  assert.equal(first.id, second.id);
  assert.equal(second.subscriberCount, 2);
  assert.equal(getSubscribedSources(userB).length, 1);
  assert.equal(getSubscribedSources(userA).length, 1);
});

test("unsubscribe decrements the counter and pauses an unsubscriber source", () => {
  const userA = userId();
  const userB = userId();
  const username = `ig_user_${suffix()}`;
  subscribeToSource(userA, "instagram", username);
  subscribeToSource(userB, "instagram", username);

  assert.equal(unsubscribeFromSource(userB, "instagram", username), true);
  const source = getSubscribedSources(userA).find(s => s.username === username)!;
  assert.equal(source.subscriberCount, 1);
  assert.equal(source.status, "active");

  assert.equal(unsubscribeFromSource(userA, "instagram", username), true);
  assert.equal(getSubscribedSources(userA).some(s => s.username === username), false);
  assert.equal(unsubscribeFromSource(userA, "instagram", username), false);
});

test("Reddit has no Bright Data dataset", () => {
  assert.equal(getDatasetForPlatform("reddit"), undefined);
  assert.throws(() => subscribeToSource(userId(), "reddit", "some_sub"), /No Bright Data dataset/);
});

test("webhook ingestion dedups by platform post id and by URL", async () => {
  const user = userId();
  const username = `ig_user_${suffix()}`;
  const source = subscribeToSource(user, "instagram", username);
  const url = `https://www.instagram.com/p/ABC${suffix()}/`;

  const payload = [
    {
      id: "post-1",
      url,
      input_url: `https://www.instagram.com/${username}/`,
      caption: "hello",
      datetime: "2026-09-22T10:00:00Z",
      image_url: `${url}media/1.jpg`,
    },
  ];

  const first = await ingestWebhookPayload(payload, { datasetId: source.datasetId });
  assert.deepEqual(first, { ingested: 1, duplicates: 0, skipped: 0, errors: 0 });

  const byId = await ingestWebhookPayload(payload, { datasetId: source.datasetId });
  assert.deepEqual(byId, { ingested: 0, duplicates: 1, skipped: 0, errors: 0 });

  const byUrl = await ingestWebhookPayload(
    [{ ...payload[0], id: "post-1-different" }],
    { datasetId: source.datasetId },
  );
  assert.deepEqual(byUrl, { ingested: 0, duplicates: 1, skipped: 0, errors: 0 });
});

test("source_id on the delivery URL attributes the batch exactly", async () => {
  const user = userId();
  const target = subscribeToSource(user, "instagram", `ig_user_${suffix()}`);
  subscribeToSource(user, "instagram", `ig_user_${suffix()}`);

  const result = await ingestWebhookPayload(
    [{ id: "post-s", url: "https://www.instagram.com/p/ZZZ/", caption: "hi" }],
    { sourceId: target.id, datasetId: target.datasetId },
  );

  assert.equal(result.ingested, 1);
  assert.equal(posts.get(target.id)!.length, 1);
});

test("input_url attributes posts whose URL hides the account name", async () => {
  const user = userId();
  const target = `ig_user_${suffix()}`;
  const bystander = `ig_user_${suffix()}`;
  const targetSource = subscribeToSource(user, "instagram", target);
  const bystanderSource = subscribeToSource(user, "instagram", bystander);

  // Same dataset for both, and a /p/ permalink with no account in it: only the
  // echoed input_url can say which profile produced the post.
  const result = await ingestWebhookPayload(
    [
      {
        id: "post-x",
        url: "https://www.instagram.com/p/XYZ/",
        input_url: `https://www.instagram.com/${target}/`,
        caption: "hi",
      },
    ],
    { datasetId: targetSource.datasetId },
  );

  assert.equal(result.ingested, 1);
  assert.equal(posts.get(targetSource.id)!.length, 1);
  assert.equal(posts.get(bystanderSource.id)!.length, 0);
});

test("webhook ingestion reports items that match no source", async () => {
  const result = await ingestWebhookPayload(
    [
      {
        id: "orphan",
        url: "https://www.instagram.com/p/NOPE/",
        input_url: "https://www.instagram.com/nobody_subscribed/",
        caption: "?",
      },
    ],
    { datasetId: getDatasetForPlatform("instagram")!.id },
  );
  assert.equal(result.errors, 1);
  assert.equal(result.ingested, 0);
});

test("items without id or url are rejected instead of colliding", async () => {
  const user = userId();
  const source = subscribeToSource(user, "instagram", `ig_user_${suffix()}`);
  const result = await ingestWebhookPayload([{}], { sourceId: source.id });

  assert.deepEqual(result, { ingested: 0, duplicates: 0, skipped: 0, errors: 1 });
});

test("an empty scraper batch is skipped, not counted as an error", async () => {
  const user = userId();
  const source = subscribeToSource(user, "x", `x_user_${suffix()}`);
  const result = await ingestWebhookPayload(
    [{ posts: [], input: source.canonicalUrl }],
    { sourceId: source.id },
  );

  assert.deepEqual(result, { ingested: 0, duplicates: 0, skipped: 1, errors: 0 });
});

test("getUserFeed returns posts from every subscribed source, newest first", () => {
  const user = userId();
  const older = `ig_user_${suffix()}`;
  const newer = `ig_user_${suffix()}`;
  subscribeToSource(user, "instagram", older);
  subscribeToSource(user, "instagram", newer);

  const olderSource = getSubscribedSources(user).find(s => s.username === older)!;
  const newerSource = getSubscribedSources(user).find(s => s.username === newer)!;

  posts.set(olderSource.id, [
    {
      platform: "instagram",
      username: older,
      platformPostId: "old",
      url: `https://www.instagram.com/${older}/old`,
      text: "old",
      publishedAt: "2026-01-01T00:00:00.000Z",
      media: [],
      metrics: {},
    },
  ]);
  posts.set(newerSource.id, [
    {
      platform: "instagram",
      username: newer,
      platformPostId: "new",
      url: `https://www.instagram.com/${newer}/new`,
      text: "new",
      publishedAt: "2026-09-22T00:00:00.000Z",
      media: [],
      metrics: {},
    },
  ]);

  const feed = getUserFeed(user);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].platformPostId, "new");
  assert.equal(feed[1].platformPostId, "old");
});

test("getUserFeed never leaks posts from another user's subscriptions", () => {
  const mine = userId();
  const theirs = userId();
  const mySource = subscribeToSource(mine, "instagram", `ig_user_${suffix()}`);
  const theirSource = subscribeToSource(theirs, "instagram", `ig_user_${suffix()}`);

  posts.set(theirSource.id, [
    {
      platform: "instagram",
      username: theirSource.username,
      platformPostId: "hidden",
      url: `https://www.instagram.com/${theirSource.username}/hidden`,
      text: "hidden",
      publishedAt: "2026-09-22T00:00:00.000Z",
      media: [],
      metrics: {},
    },
  ]);

  assert.equal(getUserFeed(mine).some(p => p.platformPostId === "hidden"), false);
  assert.ok(mySource.id !== theirSource.id);
});
