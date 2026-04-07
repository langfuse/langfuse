import { type NextApiRequest, type NextApiResponse } from "next";
import {
  getDevBypassSession,
  isDevAuthBypassEnabled,
} from "@/src/server/devAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isDevAuthBypassEnabled) {
    return res.status(404).json({ message: "Not found" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );

  return res.status(200).json(await getDevBypassSession());
}
