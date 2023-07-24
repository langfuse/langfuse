import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);
  return res.status(200).json({ status: "OK" });
}
