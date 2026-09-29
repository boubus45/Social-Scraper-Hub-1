import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import {
  initBrightDataCollection,
  shutdownBrightDataCollection,
} from "./services/brightDataCollection";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Restore persisted sources/posts before accepting requests, so a restart can
// never serve a half-empty feed or let a request overwrite what was loaded.
await initBrightDataCollection();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "Shutting down");
  // Flush pending writes first: without this the last second of ingested posts
  // would be lost.
  await shutdownBrightDataCollection();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
