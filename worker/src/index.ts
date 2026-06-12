import "./instrumentation"; // instrumenting the application
import type { Server } from "http";
import { initializeWorker } from "./initialize";
import { env } from "./env";
import { logger } from "@langfuse/shared/src/server";

export let server: Server | undefined;

const startWorker = async (): Promise<void> => {
  await initializeWorker();

  // worker is CommonJS under NodeNext, so dynamic import wraps the module namespace in default.
  const {
    default: { default: app },
  } = await import("./app.js");

  server = app.listen(env.PORT, env.HOSTNAME, () => {
    logger.info(`Listening: http://${env.HOSTNAME}:${env.PORT}`);
  });
};

startWorker().catch((error) => {
  logger.error("Failed to start worker", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
