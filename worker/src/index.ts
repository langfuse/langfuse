import app from "./app";
import { env } from "./env";
import logger from "./logger";
import { evalJobCreator, evalJobExecutor } from "./redis/consumer";

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
}

// Capture shutdown signals
process.on("SIGTERM", onShutdown);
process.on("SIGINT", onShutdown);
