import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { telemetry } from "@/src/features/telemetry";
import { prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  traceException,
} from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);
    await telemetry();
    const failIfNoRecentEvents = req.query.failIfNoRecentEvents === "true";
    const failIfDatabaseUnavailable =
      req.query.failIfDatabaseUnavailable === "true";

    try {
      if (failIfDatabaseUnavailable) {
        await prisma.$queryRaw`SELECT 1;`;
      }
    } catch (e) {
      logger.error("Couldn't connect to database", e);
      traceException(e);
      return res.status(503).json({
        status: "Database not available",
        version: VERSION.replace("v", ""),
      });
    }

    try {
      if (failIfNoRecentEvents) {
        const now = new Date();
        const traces = await queryClickhouse({
          query: `
            SELECT id
            FROM traces
            WHERE timestamp <= {now: DateTime64(3)}
            AND timestamp >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
            LIMIT 1
          `,
          params: {
            now: convertDateToClickhouseDateTime(now),
          },
          tags: {
            feature: "health-check",
            type: "trace",
          },
        });
        const observations = await queryClickhouse({
          query: `
            SELECT id
            FROM observations
            WHERE start_time <= {now: DateTime64(3)}
            AND start_time >= {now: DateTime64(3)} - INTERVAL 3 MINUTE
            LIMIT 1
          `,
          params: {
            now: convertDateToClickhouseDateTime(now),
          },
          tags: {
            feature: "health-check",
            type: "observation",
          },
        });
        if (traces.length === 0 || observations.length === 0) {
          return res.status(503).json({
            status: `No ${
              traces.length === 0
                ? "traces"
                : observations.length === 0
                  ? "observations"
                  : "<should not happen>"
            } within the last 3 minutes`,
            version: VERSION.replace("v", ""),
          });
        }
      }
    } catch (e) {
      logger.error("Couldn't fetch recent events", e);
      traceException(e);
      return res.status(503).json({
        status: "Couldn't fetch recent events",
        version: VERSION.replace("v", ""),
      });
    }
  } catch (e) {
    traceException(e);
    logger.error("Health check failed", e);
    return res.status(503).json({
      status: "Health check failed",
      version: VERSION.replace("v", ""),
    });
  }
  return res.status(200).json({
    status: "OK",
    version: VERSION.replace("v", ""),
  });
}
