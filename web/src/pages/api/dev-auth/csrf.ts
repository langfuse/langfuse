import { type NextApiRequest, type NextApiResponse } from "next";
import { isDevAuthBypassEnabled } from "@/src/server/devAuth";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (!isDevAuthBypassEnabled) {
    return res.status(404).json({ message: "Not found" });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ csrfToken: "dev-auth-bypass" });
}
