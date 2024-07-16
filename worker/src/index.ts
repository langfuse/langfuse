import "./instrumentation";
import app from "./app";
import { env } from "./env";
import logger from "./logger";

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";

const server = app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});

// Function to handle shutdown logic
async function onShutdown() {
  logger.info("Shutting down application...");

  // Stop accepting new connections
  server.close();
  logger.info("Server has been closed.");
  // Perform necessary cleanup tasks here
  // For example, close database connections, stop job executors, etc.
  await evalJobCreator?.close();
  logger.info("Eval Job Creator has been closed.");
  await evalJobExecutor?.close();
  logger.info("Eval Job Executor has been closed.");
  await batchExportJobExecutor?.close();
  logger.info("Batch Export Executor has been closed.");
}

// Capture shutdown signals
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);
