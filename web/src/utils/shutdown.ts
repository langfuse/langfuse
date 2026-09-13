// https://github.com/vercel/next.js/issues/51404
// There is no official best way to gracefully shutdown a Next.js app in Docker.
// This here is a workaround to handle SIGTERM and SIGINT signals.
// NEVER call process.exit() in this process. Kubernetes should kill the container: https://kostasbariotis.com/why-you-should-not-use-process-exit/
// We wait for 110 seconds to allow the app to finish processing requests. There is no native way to do this in Next.js.

import {
  ClickHouseClientManager,
  logger,
  redis,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

const TIMEOUT = 110_000;

declare global {
  var sigtermReceived: boolean | undefined;
}

globalThis.sigtermReceived = globalThis.sigtermReceived ?? false;

const setSigtermReceived = () => {
  console.log("Set sigterm received to true");
  globalThis.sigtermReceived = true;
};

export const isSigtermReceived = () =>
  Boolean(process.env.NEXT_MANUAL_SIG_HANDLE) && globalThis.sigtermReceived;

let drainPromise: Promise<void> | null = null;

// Flip readiness to unhealthy so the load balancer stops routing new traffic,
// wait TIMEOUT for in-flight requests to drain, then close backend
// connections. Shared by the SIGTERM/SIGINT path and the fatal-error path;
// memoized so concurrent triggers reuse one drain instead of closing
// connections twice.
export const drainAndClose = (): Promise<void> => {
  if (drainPromise) {
    return drainPromise;
  }
  setSigtermReceived();

  drainPromise = new Promise<void>((resolve) => {
    setTimeout(async () => {
      RateLimitService.shutdown();

      await ClickHouseClientManager.getInstance().closeAllConnections();

      logger.info(`Redis status ${redis?.status}`);
      if (redis && redis.status !== "end") {
        redis.disconnect();
      } else {
        logger.info("Redis connection already closed");
      }

      await prisma.$disconnect();
      logger.info("Prisma connection has been closed.");

      logger.info("Shutdown complete");
      resolve();
    }, TIMEOUT);
  });

  return drainPromise;
};

export const shutdown = async (signal: PrexitSignal) => {
  if (signal === "SIGTERM" || signal === "SIGINT") {
    console.log(
      `SIGTERM / SIGINT received. Shutting down in ${TIMEOUT / 1000} seconds.`,
    );
    await drainAndClose();
  }
};
