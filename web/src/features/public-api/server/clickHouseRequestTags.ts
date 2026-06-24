import { type NextApiRequest } from "next";
import { type ClickHouseQuerySurface } from "@langfuse/shared/src/server";

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

export const clickHouseSurfaceForRequest = (
  req: NextApiRequest,
): ClickHouseQuerySurface =>
  req.url?.split("?")[0]?.startsWith("/api/public/") ? "publicapi" : "trpc";
