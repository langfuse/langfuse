import { VERSION } from "@/src/constants";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  probeRecentTracingActivity,
  traceException,
} from "@langfuse/shared/src/server";

type HealthCheckInput = {
  failIfDatabaseUnavailable: boolean;
  failIfNoRecentEvents: boolean;
};

export type HealthCheckResult = {
  isHealthy: boolean;
  status: string;
  version: string;
};

export const runHealthCheck = async ({
  failIfDatabaseUnavailable,
  failIfNoRecentEvents,
}: HealthCheckInput): Promise<HealthCheckResult> => {
  const version = VERSION.replace("v", "");

  try {
    try {
      if (failIfDatabaseUnavailable) {
        await prisma.$queryRaw`SELECT 1;`;
      }
    } catch (error) {
      logger.error("Couldn't connect to database", error);
      traceException(error);
      return {
        isHealthy: false,
        status: "Database not available",
        version,
      };
    }

    try {
      if (failIfNoRecentEvents) {
        // GreptimeDB has no events_core; ingestion completeness is probed directly on the merged
        // traces / observations projections (always written regardless of v4 write mode).
        const { hasTrace, hasObservation } = await probeRecentTracingActivity({
          now: new Date(),
          windowMinutes: 3,
        });

        if (!hasTrace || !hasObservation) {
          return {
            isHealthy: false,
            status: `No ${!hasTrace ? "traces" : "observations"} within the last 3 minutes`,
            version,
          };
        }
      }
    } catch (error) {
      logger.error("Couldn't fetch recent events", error);
      traceException(error);
      return {
        isHealthy: false,
        status: "Couldn't fetch recent events",
        version,
      };
    }
  } catch (error) {
    traceException(error);
    logger.error("Health check failed", error);
    return {
      isHealthy: false,
      status: "Health check failed",
      version,
    };
  }

  return {
    isHealthy: true,
    status: "OK",
    version,
  };
};
