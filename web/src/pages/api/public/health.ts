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
  let tracesWithinLastMinute = false;
  let observationsWithinLastMinute = false;
  try {
    await prisma.$queryRaw`SELECT 1;`;

    const now = Date.now();

    // Check if there are any traces or observations within the last minute
    if (
      await prisma.trace.findFirst({
        where: {
          timestamp: {
            gte: new Date(now - 60000),
            lte: new Date(now),
          },
        },
        select: {
          id: true,
        },
      })
    ) {
      tracesWithinLastMinute = true;
    }
    if (
      await prisma.observation.findFirst({
        where: {
          startTime: {
            gte: new Date(now - 60000),
            lte: new Date(now),
          },
        },
        select: {
          id: true,
        },
      })
    ) {
      observationsWithinLastMinute = true;
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
    newObjectsWithinLastMinute: {
      traces: tracesWithinLastMinute,
      observations: observationsWithinLastMinute,
    },
  });
}
