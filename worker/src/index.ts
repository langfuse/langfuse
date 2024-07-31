import "./instrumentation";
import app from "./app";
import { env } from "./env";
import logger from "./logger";

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";
import { setSigtermReceived } from "./features/health";
import { redis } from "@langfuse/shared/src/server";

const server = app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});

// Function to handle shutdown logic
async function onShutdown() {
  logger.info("Shutting down application...");
  setSigtermReceived();

  // Stop accepting new connections
  server.close();
  logger.info("Server has been closed.");
  // Perform necessary cleanup tasks here
  // For example, close database connections, stop job executors, etc.
  await Promise.all([
    evalJobCreator?.close(),
    evalJobExecutor?.close(),
    batchExportJobExecutor?.close(),
  ]);
  redis?.disconnect();
  logger.info("Http server and Redis jobs have been closed.");
}

// Capture shutdown signals
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);
