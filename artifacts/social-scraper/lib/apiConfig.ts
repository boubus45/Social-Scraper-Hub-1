// Single source of truth for the backend base URL.
// Value has no trailing slash and never ends in /api — callers append paths like
// `/api/brightdata/feed` themselves.
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL
  ?? "https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api"
).replace(/\/+$/, "").replace(/\/api$/, "");
