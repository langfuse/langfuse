import "./instrumentation"; // instrumenting the application
import "./ee/fipsMode"; // enforce LANGFUSE_REQUIRE_FIPS before anything connects
import type { Server } from "http";
import { initializeWorker } from "./initialize";
import { env } from "./env";
import { logger } from "@langfuse/shared/src/server";
import { getStartupJitterMs, sleep } from "./utils/startupJitter";

export let server: Server | undefined;

const startWorker = async (): Promise<void> => {
  await initializeWorker();

  // Importing app.js registers all queue consumers and starts the periodic
  // runners, which open their Redis connections. Delay it by a random amount
  // so tasks that boot together do not connect in the same instant.
  const startupJitterMs = getStartupJitterMs(
    env.LANGFUSE_WORKER_STARTUP_JITTER_MAX_MS,
  );
  if (startupJitterMs > 0) {
    logger.info(
      `Delaying queue registration by ${startupJitterMs}ms (startup jitter)`,
    );
    await sleep(startupJitterMs);
  }

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
