import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);
  try {
    await prisma.$queryRaw`SELECT 1;`;
  } catch (e) {
    return res.status(500).json({ status: "Database not available" });
  }
  return res.status(200).json({ status: "OK" });
}
