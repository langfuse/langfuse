import { createContext, useContext } from "react";
import { api } from "@/src/utils/api";
import { type TopicTraceQuery, type TopicTracesResult } from "./facet-topics";

/** Which map the Topics page shows: a rule's live map, an analysis snapshot, or every rule. */
export type TopicMapScope = { ruleId?: string; analysisId?: string };

export const FacetTraceSource = createContext<
  ({ projectId: string; facetId: string } & TopicMapScope) | null
>(null);

/** Pages a facet's traces from the server; `null` matches nothing without a request. */
export function useFacetTopicTraces(
  query: TopicTraceQuery | null,
): TopicTracesResult {
  const source = useContext(FacetTraceSource);
  const input = {
    projectId: source?.projectId ?? "",
    facetId: source?.facetId ?? "",
    ruleId: source?.ruleId,
    analysisId: source?.analysisId,
    ...query,
  };
  const sessionCount = api.topics.traceSessionCount.useQuery(input, {
    enabled: Boolean(source) && query !== null,
    meta: { toastOperation: "topics.load" },
  });
  const result = api.topics.traces.useInfiniteQuery(input, {
    enabled: Boolean(source) && query !== null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    meta: { toastOperation: "topics.load" },
  });
  // Disabled queries keep their cached pages, so `null` must not read them.
  if (query === null)
    return {
      rows: [],
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      loadMore: () => undefined,
    };
  return {
    rows: result.data?.pages.flatMap((page) => page.rows) ?? [],
    isLoading: result.isLoading,
    isLoadingMore: result.isFetchingNextPage,
    error: result.error?.message ?? null,
    hasMore: Boolean(result.hasNextPage),
    sessionCount: sessionCount.data ?? null,
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage)
        result.fetchNextPage();
    },
  };
}
