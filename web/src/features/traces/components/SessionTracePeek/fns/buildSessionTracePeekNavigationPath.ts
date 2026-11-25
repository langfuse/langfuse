import { type TraceDetailPageListEntry } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";

export function buildSessionTracePeekNavigationPath(
  pathname: string,
  search: string,
  entry: TraceDetailPageListEntry,
) {
  const next = new URLSearchParams(search);
  next.delete("observation");
  next.delete("traceId");
  next.delete("timestamp");
  next.set("peek", decodeURIComponent(entry.id));
  next.set("aggregation", "trace");
  if (entry.params?.timestamp) next.set("timestamp", entry.params.timestamp);
  return `${pathname}?${next.toString()}`;
}
