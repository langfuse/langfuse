import { VERSION } from "@/src/constants";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  logger,
  measureAndReturn,
  queryClickhouse,
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
        const now = new Date();
        const clickhouseNow = convertDateToClickhouseDateTime(now);

        const traces = await measureAndReturn({
          operationName: "healthCheckTraces",
          projectId: "__CROSS_PROJECT__",
          input: {
            now: clickhouseNow,
          },
          fn: async (params: { now: string }) =>
            queryClickhouse<{ id: string }>({
              query: `
                SELECT id
                FROM traces
                WHERE timestamp <= {now: DateTime64(3)}
                AND timestamp >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
                LIMIT 1
              `,
              params,
              tags: {
                feature: "health-check",
                type: "trace",
              },
            }),
        });

        const observations = await queryClickhouse<{ id: string }>({
          query: `
            SELECT id
            FROM observations
            WHERE start_time <= {now: DateTime64(3)}
            AND start_time >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
            LIMIT 1
          `,
          params: {
            now: clickhouseNow,
          },
          tags: {
            feature: "health-check",
            type: "observation",
          },
        });

        if (traces.length === 0 || observations.length === 0) {
          return {
            isHealthy: false,
            status: `No ${traces.length === 0 ? "traces" : "observations"} within the last 3 minutes`,
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
