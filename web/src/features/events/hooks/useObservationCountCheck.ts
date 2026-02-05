import { api } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";

/**
 * Checks if there are root observations for current filter conditions.
 * If no, default to the observation view mode instead.
 */
export function useObservationCountCheck({
  projectId,
  filterStateWithoutViewMode,
  enabled,
}: {
  projectId: string;
  filterStateWithoutViewMode: FilterState;
  enabled: boolean;
}) {
  const query = api.events.countAll.useQuery(
    {
      projectId,
      filter: filterStateWithoutViewMode,
      searchQuery: null,
      searchType: ["id", "content"],
      page: 1,
      limit: 1,
      orderBy: null,
    },
    {
      enabled,
      staleTime: 60_000, // 1 minute stale time to prevent spam
    },
  );

  return {
    observationCount: query.data?.totalCount ?? null,
    isSuccess: query.isSuccess,
    isPending: query.isPending,
  };
}
