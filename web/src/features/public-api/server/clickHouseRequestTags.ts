import { type NextApiRequest } from "next";

const stripSearchAndHash = (url: string) => url.split(/[?#]/, 1)[0] ?? "";

export const clickHouseRouteForRequest = (req: NextApiRequest) => {
  const method = req.method ?? "UNKNOWN";
  const rawUrl = req.url ?? "";

  try {
    const pathname = rawUrl
      ? new URL(rawUrl, "http://langfuse.local").pathname
      : "";
    return `${method} ${pathname}`;
  } catch {
    return `${method} ${stripSearchAndHash(rawUrl)}`;
  }
};
