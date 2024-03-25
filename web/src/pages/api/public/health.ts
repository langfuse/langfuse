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
  try {
    await prisma.$queryRaw`SELECT 1;`;
  } catch (e) {
    return res.status(503).json({
      status: "Database not available",
      version: VERSION.replace("v", ""),
    });
  }
  return res
    .status(200)
    .json({ status: "OK", version: VERSION.replace("v", "") });
}
