import { createContext, useContext } from "react";
import { api } from "@/src/utils/api";
import { type TopicTraceQuery, type TopicTracesResult } from "./facet-topics";

export const FacetTraceSource = createContext<{
  projectId: string;
  facetId: string;
} | null>(null);

/** Pages a facet's traces from the server; `null` matches nothing without a request. */
export function useFacetTopicTraces(
  query: TopicTraceQuery | null,
): TopicTracesResult {
  const source = useContext(FacetTraceSource);
  const result = api.topics.traces.useInfiniteQuery(
    {
      projectId: source?.projectId ?? "",
      facetId: source?.facetId ?? "",
      ...query,
    },
    {
      enabled: Boolean(source) && query !== null,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      meta: { toastOperation: "topics.load" },
    },
  );
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
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage)
        result.fetchNextPage();
    },
  };
}
