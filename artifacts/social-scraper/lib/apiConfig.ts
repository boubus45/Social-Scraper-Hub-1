// Single source of truth for the backend base URL.
//
// `EXPO_PUBLIC_API_URL` is injected at bundle time by the APK workflow from the
// repository variable `EXPO_PUBLIC_API_URL` (`gh variable set EXPO_PUBLIC_API_URL`),
// so moving hosts never needs a code change. An unset or empty variable has to
// fall back to the default — `??` would not, and "" would make every request
// relative. Value has no trailing slash and never ends in /api — callers append
// paths like `/api/brightdata/feed` themselves.
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_BASE_URL = (
  fromEnv
  || "https://shiny-memory-7499jrvjj652xprv-3000.app.github.dev/api"
).replace(/\/+$/, "").replace(/\/api$/, "");
