import { api } from "@/src/utils/api";
import { useMemo } from "react";

/**
 * Custom hook for fetching filter options for the experiment items table.
 * Uses the existing filterOptions endpoint and returns options applicable to experiment items.
 *
 * Note: experimentId is accepted but not currently used for filtering.
 * A future itemFilterOptions endpoint could be added to scope options to a specific experiment.
 */
export function useExperimentItemsFilterOptions({
  projectId,
}: {
  projectId: string;
  experimentId: string;
}) {
  // Fetch filter options from the existing experiments filterOptions endpoint
  // This returns scores scoped to all experiments, which is sufficient for now
  const filterOptionsQuery = api.experiments.filterOptions.useQuery(
    {
      projectId,
    },
    {
      // Keep previous data while loading new options
      placeholderData: (previousData) => previousData,
    },
  );

  const experimentItemsFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptionsQuery.data?.score_categories?.reduce(
        (
          acc: Record<string, string[]>,
          score: { label: string; values: string[] },
        ) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    return {
      scores_avg: filterOptionsQuery.data?.scores_avg ?? undefined,
      score_categories: scoreCategories,
    };
  }, [filterOptionsQuery.data]);

  return {
    filterOptions: experimentItemsFilterOptions,
    isFilterOptionsPending: filterOptionsQuery.isLoading,
  };
}
