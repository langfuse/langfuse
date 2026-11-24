import { type ParsedUrlQuery } from "querystring";
import { type ListEntry } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";

export function getSessionDetailNavigationPath({
  projectId,
  entry,
  query,
}: {
  projectId: string;
  entry: ListEntry;
  query: ParsedUrlQuery;
}) {
  const params = new URLSearchParams();
  for (const key of [
    "traceView",
    "traceFilter",
    "sessionView",
    "tracesWithoutMatches",
  ]) {
    const value = query[key];
    if (typeof value === "string") params.set(key, value);
  }
  const search = params.size > 0 ? `?${params}` : "";
  // DetailPageNav supplies an already encoded path segment.
  return `/project/${projectId}/sessions/${entry.id}${search}`;
}
