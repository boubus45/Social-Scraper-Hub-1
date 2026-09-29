// Normalization tests using record shapes captured from the live Bright Data API.
//
// Run with `pnpm test` in artifacts/api-server (node --test, type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeedRecords, normalizeProfile } from "./brightDataNormalize.ts";
import { parseDatasetPayload } from "./brightDataHttp.ts";

// ─── Profile datasets (Instagram, LinkedIn, TikTok) ─────────────────────

test("Instagram profile records flatten into their posts", () => {
  const records = [
    {
      account: "nasa",
      full_name: "NASA",
      biography: "Making the seemingly impossible, possible.",
      followers: 104320903,
      following: 89,
      is_verified: true,
      profile_image_link: "https://cdninstagram.com/avatar.jpg",
      external_url: ["https://www.nasa.gov/"],
      posts: [
        {
          id: "3601234567890123456",
          url: "https://www.instagram.com/p/ABC123/",
          caption: "The Artemis III crew signed the hardware.",
          datetime: "2026-09-20T10:00:00.000Z",
          image_url: "https://cdninstagram.com/p/ABC123/media.jpg",
          content_type: "GraphImage",
        },
      ],
    },
  ];

  const posts = normalizeFeedRecords("instagram", records, "fallback");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].username, "nasa");
  assert.equal(posts[0].platformPostId, "3601234567890123456");
  assert.equal(posts[0].text, "The Artemis III crew signed the hardware.");
  assert.equal(posts[0].publishedAt, "2026-09-20T10:00:00.000Z");
  assert.deepEqual(posts[0].media, [
    { type: "image", url: "https://cdninstagram.com/p/ABC123/media.jpg" },
  ]);

  const profile = normalizeProfile("instagram", records[0]);
  assert.equal(profile.displayName, "NASA");
  assert.equal(profile.followers, 104320903);
  assert.equal(profile.verified, true);
  assert.equal(profile.externalUrl, "https://www.nasa.gov/");
  assert.equal(profile.posts.length, 1);
});

test("LinkedIn posts read title + attribution and parse the interaction string", () => {
  const records = [
    {
      id: "satyanadella",
      name: "Satya Nadella",
      about: "As chairman and CEO of Microsoft…",
      posts: [
        {
          title: "How do we build a frontier intelligence ecosystem?",
          attribution: "Great to be back at Microsoft Build today.",
          link: "https://www.linkedin.com/pulse/frontier-ai-satya",
          created_at: "2026-06-02T00:00:00.000Z",
          interaction: "2,530 - 139 Comments",
          id: "7467640896965210113",
        },
      ],
    },
  ];

  const posts = normalizeFeedRecords("linkedin", records, "fallback");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].username, "satyanadella");
  assert.match(posts[0].text, /frontier intelligence ecosystem/);
  assert.match(posts[0].text, /Microsoft Build/);
  assert.equal(posts[0].url, "https://www.linkedin.com/pulse/frontier-ai-satya");
  assert.equal(posts[0].publishedAt, "2026-06-02T00:00:00.000Z");
  assert.equal(posts[0].metrics.likes, 2530);
  assert.equal(posts[0].metrics.comments, 139);
});

test("TikTok posts join top_posts_data with top_videos by id", () => {
  const records = [
    {
      account_id: "nasa",
      nickname: "NASA",
      followers: 1000,
      top_posts_data: [
        {
          post_id: "7665075736742530317",
          post_url: "https://www.tiktok.com/@nasa/video/7665075736742530317",
          description: "Something big just landed on TikTok.",
          likes: 94500,
          create_time: "2026-07-21T20:09:02.000Z",
          post_type: "video",
        },
      ],
      top_videos: [
        {
          video_id: "7665075736742530317",
          video_url: "https://www.tiktok.com/@nasa/video/7665075736742530317",
          cover_image: "https://p19-common-sign.tiktokcdn-us.com/cover.jpg",
          commentcount: 2847,
          share_count: 3132,
          playcount: 1400000,
        },
      ],
    },
  ];

  const posts = normalizeFeedRecords("tiktok", records, "fallback");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].username, "nasa");
  assert.equal(posts[0].text, "Something big just landed on TikTok.");
  assert.equal(posts[0].metrics.likes, 94500);
  assert.equal(posts[0].metrics.comments, 2847);
  assert.equal(posts[0].metrics.shares, 3132);
  assert.equal(posts[0].metrics.views, 1400000);
  // The cover is an image; video_url is a page link, not a playable file.
  assert.deepEqual(posts[0].media, [
    { type: "image", url: "https://p19-common-sign.tiktokcdn-us.com/cover.jpg" },
  ]);
});

// ─── Flat post datasets (Facebook) ──────────────────────────────────────

test("Facebook page posts are flat records", () => {
  const records = [
    {
      post_id: "123_456",
      user_url: "https://www.facebook.com/NASA",
      content: "Artemis III launch window confirmed.",
      date_posted: "2026-09-18T14:00:00.000Z",
      likes: 5400,
      num_comments: 321,
      num_shares: 88,
      attachments: [
        {
          type: "Video",
          thumbnail_url: "https://scontent.xx.fbcdn.net/thumb.jpg",
          video_url: "https://scontent.xx.fbcdn.net/v/video.mp4",
        },
      ],
    },
  ];

  const posts = normalizeFeedRecords("facebook", records, "nasa");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].platformPostId, "123_456");
  assert.equal(posts[0].text, "Artemis III launch window confirmed.");
  assert.equal(posts[0].publishedAt, "2026-09-18T14:00:00.000Z");
  assert.equal(posts[0].metrics.likes, 5400);
  assert.equal(posts[0].metrics.comments, 321);
  assert.equal(posts[0].metrics.shares, 88);
  assert.deepEqual(posts[0].media, [
    { type: "video", url: "https://scontent.xx.fbcdn.net/v/video.mp4" },
    { type: "image", url: "https://scontent.xx.fbcdn.net/thumb.jpg" },
  ]);
});

// ─── Scraper Studio scraper (X) ─────────────────────────────────────────

const xScraperRecord = {
  posts: [
    {
      post_url: "https://x.com/NASA/status/2103583087540003274/photo/1",
      post_text: "Welcome to the Artemis Accords, San Marino 🇸🇲",
      author_handle: "@NASA",
      posted_date: "8:31 PM · Sep 25, 2026",
      reply_count: 412,
      repost_count: 1050,
      like_count: 8900,
      view_count: 1200000,
      media_image_url: "https://pbs.twimg.com/media/abc.jpg",
      author_profile_image: "https://pbs.twimg.com/profile_images/avatar.jpg",
    },
  ],
  product_page_url: "https://x.com/NASA",
  input: "https://x.com/NASA",
};

test("X scraper records flatten their posts array and use the status id", () => {
  const posts = normalizeFeedRecords("x", [xScraperRecord], "fallback");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].platformPostId, "2103583087540003274");
  // /photo/1 stripped so the same post joins on one URL across scrapes.
  assert.equal(posts[0].url, "https://x.com/NASA/status/2103583087540003274");
  assert.equal(posts[0].username, "NASA");
  assert.equal(posts[0].text, "Welcome to the Artemis Accords, San Marino 🇸🇲");
  assert.equal(posts[0].metrics.likes, 8900);
  assert.equal(posts[0].metrics.comments, 412);
  assert.equal(posts[0].metrics.shares, 1050);
  assert.equal(posts[0].metrics.views, 1200000);
  // Post image kept, profile avatar excluded.
  assert.deepEqual(posts[0].media, [{ type: "image", url: "https://pbs.twimg.com/media/abc.jpg" }]);
});

test("X display dates become real timestamps", () => {
  const posts = normalizeFeedRecords("x", [xScraperRecord], "nasa");

  assert.equal(posts[0].publishedAt, new Date(2026, 8, 25, 20, 31).toISOString());
});

test("X dates without a year or clock still parse", () => {
  const make = (posted_date: string) => ({
    posts: [{ post_url: "https://x.com/NASA/status/1", post_text: "x", author_handle: "@NASA", posted_date }],
  });

  const withoutYear = normalizeFeedRecords("x", [make("Sep 25")], "nasa")[0];
  assert.ok(withoutYear.publishedAt, "expected a timestamp for 'Sep 25'");
  assert.equal(new Date(withoutYear.publishedAt!).getMonth(), 8);
  assert.equal(new Date(withoutYear.publishedAt!).getDate(), 25);

  const relative = normalizeFeedRecords("x", [make("2h")], "nasa")[0];
  assert.equal(relative.publishedAt, undefined, "relative clocks are not dates");
});

test("X posts without a date recover it from the snowflake id", () => {
  const posts = normalizeFeedRecords(
    "x",
    [{ posts: [{ post_url: "https://x.com/a/status/2104664420299276651", post_text: "rt", author_handle: "@a" }] }],
    "fallback",
  );

  assert.ok(posts[0].publishedAt, "expected a snowflake-derived date");
  const derived = new Date(posts[0].publishedAt!);
  assert.equal(derived.getFullYear(), 2026);

  // Other platforms have no snowflake convention: absent means absent.
  const instagram = normalizeFeedRecords(
    "instagram",
    [{ account: "nasa", posts: [{ id: "12345678901234567", url: "https://instagram.com/p/x/" }] }],
    "nasa",
  );
  assert.equal(instagram[0].publishedAt, undefined);
});

test("profile records with no posts are not read as posts themselves", () => {
  const posts = normalizeFeedRecords("instagram", [{ account: "quiet", posts: [] }], "fallback");
  assert.equal(posts.length, 0);
});

test("records without an id are skipped instead of colliding", () => {
  const posts = normalizeFeedRecords("facebook", [{ content: "no id here" }, null, "junk"], "nasa");
  assert.equal(posts.length, 0);
});

// ─── Response parsing ───────────────────────────────────────────────────

test("parseDatasetPayload handles every Bright Data response shape", () => {
  // Dataset snapshots: a JSON array.
  assert.deepEqual(parseDatasetPayload('[{"id":"1"},{"id":"2"}]'), [{ id: "1" }, { id: "2" }]);

  // Ready state: an object becomes one record.
  assert.deepEqual(parseDatasetPayload('{"id":"1"}'), [{ id: "1" }]);

  // Scraper Studio: several documents concatenated on separate lines.
  const concatenated = '{"posts":[]}\n{"posts":[]}\n';
  assert.equal(parseDatasetPayload(concatenated).length, 2);

  // Not-ready sentinels parse to nothing so callers keep polling.
  assert.deepEqual(parseDatasetPayload('{"status":"building","message":"try again in 30s"}'), []);
  assert.deepEqual(parseDatasetPayload('{"status":"running"}'), []);
  assert.deepEqual(parseDatasetPayload(""), []);
});
