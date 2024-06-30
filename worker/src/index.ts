import { env } from "./env";
import logger from "./logger";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: String(env.SENTRY_DSN),

  skipOpenTelemetrySetup: true,

  // Add Tracing by setting tracesSampleRate
  // We recommend adjusting this value in production
  tracesSampleRate: 1,

  // Set sampling rate for profiling
  // This is relative to tracesSampleRate
  profilesSampleRate: 1,
  debug: true,
});
import { initializeOtel } from "./instrumentation";

const sdk = initializeOtel("langfuse-worker");
// sdk.start();

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";
import app from "./app";

const server = app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});

// Function to handle shutdown logic
function onShutdown() {
  logger.info("Shutting down application...");

  // Stop accepting new connections
  server.close();

  // Perform necessary cleanup tasks here
  // For example, close database connections, stop job executors, etc.
  evalJobCreator
    ?.close()
    .then(() => logger.info("Eval Job Creator has been closed."));
  evalJobExecutor
    ?.close()
    .then(() => logger.info("Eval Job Executor has been closed."));
  batchExportJobExecutor
    ?.close()
    .then(() => logger.info("Batch Export Executor has been closed."));

  // sdk
  //   .shutdown()
  //   .then(
  //     () => logger.info("SDK shut down successfully"),
  //     (err) => logger.error("Error shutting down SDK", err)
  //   )
  //   .finally(() => process.exit(0));
}

// Capture shutdown signals
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);
