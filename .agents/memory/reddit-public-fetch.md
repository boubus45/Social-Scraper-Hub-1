---
name: Reddit public fetching
description: Durable behavior of Reddit's unauthenticated feed endpoints for this app.
---

Reddit's public JSON listing endpoints may return HTTP 403 from the installed mobile app even with a descriptive User-Agent. Reddit's Atom RSS feeds are a viable no-credential read path, but multiple feed requests sent in a burst can return HTTP 429, so clients should keep responses small and pace/retry requests.

**Why:** The app's configured Reddit sources are intended to work without requiring a Reddit developer application, while Reddit's API access and rate limits change independently of the app.

**How to apply:** Prefer the public RSS route for no-credential reads, keep credentialed OAuth fetching as an explicit API mode, and do not replace the existing GitHub Actions APK workflow when addressing this behavior.