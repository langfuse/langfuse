import { type NextApiRequest } from "next";

export const clickHouseRouteForRequest = (req: NextApiRequest) => {
  const method = req.method ?? "UNKNOWN";
  const rawUrl = req.url ?? "";

  try {
    const pathname = rawUrl
      ? new URL(rawUrl, "http://langfuse.local").pathname
      : "";
    return `${method} ${pathname}`;
  } catch {
    return `${method} ${rawUrl}`;
  }
};
