import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import { runHealthCheck } from "@/src/features/public-api/server/health-service";
import { telemetry } from "@/src/features/telemetry";
import {
  contextWithLangfuseProps,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);
    await telemetry();
    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      clickhouse: {
        surface: "publicapi",
        route: clickHouseRouteForRequest(req),
      },
    });
    const result = await opentelemetry.context.with(ctx, () =>
      runHealthCheck({
        failIfNoRecentEvents: req.query.failIfNoRecentEvents === "true",
        failIfDatabaseUnavailable:
          req.query.failIfDatabaseUnavailable === "true",
      }),
    );

    return res.status(result.isHealthy ? 200 : 503).json({
      status: result.status,
      version: result.version,
    });
  } catch (e) {
    traceException(e);
    logger.error("Health check failed", e);
    return res.status(503).json({
      status: "Health check failed",
      version: VERSION.replace("v", ""),
    });
  }
}
