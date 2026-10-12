import { type NextApiRequest } from "next";

const stripSearchAndHash = (url: string) => url.split(/[?#]/, 1)[0] ?? "";

const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Replaces each dynamic path segment with its Next.js route parameter name
 * (`/api/public/traces/abc` -> `/api/public/traces/[traceId]`), so the route
 * names the endpoint rather than the entity and stays bounded. `req.query`
 * merges route parameters with search parameters; names that appear in the
 * search string are skipped because the caller chooses them.
 */
const templateDynamicSegments = (
  pathname: string,
  query: NextApiRequest["query"] | undefined,
  searchParams: URLSearchParams,
) => {
  const routeParams = Object.entries(query ?? {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && !searchParams.has(entry[0]),
  );
  if (routeParams.length === 0) return pathname;

  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      const decoded = decodeSegment(segment);
      const param = routeParams.find(([, value]) => value === decoded);
      return param ? `[${param[0]}]` : segment;
    })
    .join("/");
};

export const clickHouseRouteForRequest = (req: NextApiRequest) => {
  const method = req.method ?? "UNKNOWN";
  const rawUrl = req.url ?? "";

  try {
    const url = new URL(rawUrl || "/", "http://langfuse.local");
    const pathname = rawUrl ? url.pathname : "";
    return `${method} ${templateDynamicSegments(pathname, req.query, url.searchParams)}`;
  } catch {
    return `${method} ${stripSearchAndHash(rawUrl)}`;
  }
};
