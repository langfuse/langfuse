import { useEffect, useMemo } from "react";
import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { api } from "@/src/utils/api";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Every observation of one trace that a sample filter matches, loaded page by page up to a cap. */
export function useEvaluatorTraceMatches({
  projectId,
  filter,
  searchQuery,
  searchType,
  traceId,
}: {
  projectId: string;
  filter: FilterState;
  searchQuery: string | null;
  searchType: TracingSearchType[];
  /** Null loads nothing. */
  traceId: string | null;
}) {
  const query = api.events.listCursor.useInfiniteQuery(
    {
      projectId,
      filter: [
        ...filter,
        {
          column: "traceId",
          type: "string" as const,
          operator: "=" as const,
          value: traceId ?? "",
        },
      ],
      searchQuery,
      searchType,
      limit: PAGE_SIZE,
    },
    {
      enabled: traceId !== null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const pages = query.data?.pages;
  const pageCount = pages?.length ?? 0;
  const needsNextPage =
    query.hasNextPage && !query.isFetching && pageCount < MAX_PAGES;
  const fetchNextPage = query.fetchNextPage;
  useEffect(() => {
    if (!needsNextPage) return;
    fetchNextPage().catch(() => undefined);
  }, [needsNextPage, pageCount, fetchNextPage]);

  return useMemo(
    () =>
      traceId === null
        ? []
        : (pages ?? []).flatMap((page) => page.observations),
    [traceId, pages],
  );
}
