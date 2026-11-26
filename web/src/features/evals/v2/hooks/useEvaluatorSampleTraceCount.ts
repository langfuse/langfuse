import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { api } from "@/src/utils/api";

/** Distinct traces a sample filter matches; null until the count is known. */
export function useEvaluatorSampleTraceCount({
  projectId,
  filter,
  searchQuery,
  searchType,
  enabled,
}: {
  projectId: string;
  filter: FilterState;
  searchQuery: string | null;
  searchType: TracingSearchType[];
  enabled: boolean;
}) {
  const query = api.events.countAll.useQuery(
    { projectId, filter, searchQuery, searchType, orderBy: null },
    { enabled },
  );
  return query.data?.uniqueTraceCount ?? null;
}
