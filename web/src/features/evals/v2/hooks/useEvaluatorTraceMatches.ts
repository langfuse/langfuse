import { useEffect, useMemo } from "react";
import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { resolveTraceMatches } from "@/src/features/evals/v2/fns/evaluatorTesting/resolveTraceMatches";
import { api } from "@/src/utils/api";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/**
 * Every observation of one trace that a sample filter matches. Pages load up
 * to a cap; the result stays empty until the last one is in, and for good once
 * the lookup has failed, so older matches never slot in ahead of a sample the
 * user is already on.
 */
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

  const isComplete =
    query.isSuccess && (!query.hasNextPage || pageCount >= MAX_PAGES);
  // Stays set after a retry succeeds.
  const hasFailed = query.errorUpdateCount > 0;

  return useMemo(
    () =>
      resolveTraceMatches({
        traceId,
        isComplete,
        hasFailed,
        pages: (pages ?? []).map((page) => page.observations),
      }),
    [traceId, isComplete, hasFailed, pages],
  );
}
