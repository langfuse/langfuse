import "./instrumentation"; // instrumenting the application
import type { Server } from "http";
import { initializeWorker } from "./initialize";
import { env } from "./env";
import { logger } from "@langfuse/shared/src/server";

export let server: Server | undefined;

const startWorker = async (): Promise<void> => {
  await initializeWorker();

  type AppDefault = typeof import("./app.js").default;
  const mod = (await import("./app.js")) as unknown as {
    default: AppDefault | { default: AppDefault };
  };
  const app: AppDefault =
    typeof mod.default === "function" ? mod.default : mod.default.default;

  server = app.listen(env.PORT, env.HOSTNAME, () => {
    logger.info(`Listening: http://${env.HOSTNAME}:${env.PORT}`);
  });
};

startWorker().catch((error) => {
  logger.error("Failed to start worker", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
