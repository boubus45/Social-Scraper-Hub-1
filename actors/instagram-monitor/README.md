# Social Scraper Instagram Monitor Actor

This Actor reads public Instagram profile pages and returns normalized post records. It does not accept Instagram passwords, session cookies, or private-account credentials.

## Local run

```bash
npm install
npx tsx src/main.ts
```

For a local run, provide Apify input through the Apify CLI or run it in Console. The Actor uses persistent Apify Key-Value Store state keyed by `monitorId` to filter already-seen post IDs.

## Input

```json
{
  "accounts": ["instagram"],
  "maxPostsPerAccount": 2,
  "onlyNew": true,
  "monitorId": "local-test-instagram-001"
}
```

Use only publicly accessible accounts and comply with Instagram and Apify terms.
