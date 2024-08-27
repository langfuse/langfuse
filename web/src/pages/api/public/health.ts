import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { telemetry } from "@/src/features/telemetry";
import { isSigtermReceived } from "@/src/utils/shutdown";
import { prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";
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
      if (isSigtermReceived()) {
        console.log(
          "Health check failed: SIGTERM / SIGINT received, shutting down.",
        );
        return res.status(500).json({
          status: "SIGTERM / SIGINT received, shutting down",
          version: VERSION.replace("v", ""),
        });
      }
      await prisma.$queryRaw`SELECT 1;`;

      if (failIfNoRecentEvents) {
        const now = Date.now();
        const trace = await prisma.trace.findFirst({
          where: {
            timestamp: {
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
            startTime: {
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
      console.log("Health check failed: db not available", e);
      traceException(e);
      return res.status(503).json({
        status: "Database not available",
        version: VERSION.replace("v", ""),
      });
    }
  } catch (e) {
    traceException(e);
    console.log("Health check failed: ", e);
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
