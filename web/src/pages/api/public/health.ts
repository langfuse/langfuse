import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { telemetry } from "@/src/features/telemetry";
import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);
  await telemetry();
  const failIfNoEventsInLastMinute =
    req.query.failIfNoEventsInLastMinute === "true";

  try {
    await prisma.$queryRaw`SELECT 1;`;

    if (failIfNoEventsInLastMinute) {
      const now = Date.now();
      const trace = await prisma.trace.findFirst({
        where: {
          timestamp: {
            gte: new Date(now - 60000),
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
            gte: new Date(now - 60000),
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
          } within the last minute`,
          version: VERSION.replace("v", ""),
        });
      }
    }
  } catch (e) {
    return res.status(503).json({
      status: "Database not available",
      version: VERSION.replace("v", ""),
    });
  }
  return res.status(200).json({
    status: "OK",
    version: VERSION.replace("v", ""),
  });
}
