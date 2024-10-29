import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { telemetry } from "@/src/features/telemetry";
import { prisma } from "@langfuse/shared/src/db";
import { logger, traceException } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);
    await telemetry();
    const failIfNoRecentEvents = req.query.failIfNoRecentEvents === "true";

    try {
      if (failIfNoRecentEvents) {
        const now = Date.now();
        const trace = await prisma.trace.findFirst({
          where: {
            createdAt: {
              gte: new Date(now - 180000), // 3 minutes ago
              lte: new Date(now),
            },
          },
          select: {
            id: true,
          },
        });
        const observation = await prisma.observation.findFirst({
          where: {
            createdAt: {
              gte: new Date(now - 180000), // 3 minutes ago
              lte: new Date(now),
            },
          },
          select: {
            id: true,
          },
        });
        if (!!!trace || !!!observation) {
          return res.status(503).json({
            status: `No ${
              !!!trace
                ? "traces"
                : !!!observation
                  ? "observations"
                  : "<should not happen>"
            } within the last 3 minutes`,
            version: VERSION.replace("v", ""),
          });
        }
      }
    } catch (e) {
      logger.error("Couldn't fetch recent events: db not available", e);
      traceException(e);
      return res.status(503).json({
        status: "Database not available",
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
