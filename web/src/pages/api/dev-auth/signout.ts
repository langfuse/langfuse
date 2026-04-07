import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "@/src/env.mjs";
import { isDevAuthBypassEnabled } from "@/src/server/devAuth";

const getCallbackUrl = (req: NextApiRequest): string => {
  if (typeof req.body?.callbackUrl === "string") {
    return req.body.callbackUrl;
  }

  if (
    req.body &&
    typeof req.body === "object" &&
    "callbackUrl" in req.body &&
    typeof req.body.callbackUrl === "string"
  ) {
    return req.body.callbackUrl;
  }

  if (typeof req.query.callbackUrl === "string") {
    return req.query.callbackUrl;
  }

  return `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isDevAuthBypassEnabled) {
    return res.status(404).json({ message: "Not found" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ url: getCallbackUrl(req) });
}
