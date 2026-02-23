import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { type FilterState, type TimeFilter } from "@langfuse/shared";

export function useExperimentFilterOptions({
  projectId,
  oldFilterState,
}: {
  projectId: string;
  oldFilterState: FilterState;
}) {
  // Fetch datasets to get ID -> name mapping
  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId,
  });

  // Extract start time filters for filter options query
  const startTimeFilters = useMemo(() => {
    return oldFilterState.filter(
      (f) =>
        (f.column === "Start Time" || f.column === "startTime") &&
        f.type === "datetime",
    ) as TimeFilter[];
  }, [oldFilterState]);

  // Fetch experiment-specific filter options (scores scoped to experiment events)
  const filterOptions = api.experiments.filterOptions.useQuery({
    projectId,
    startTimeFilter: startTimeFilters.length > 0 ? startTimeFilters : undefined,
  });

  const experimentFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const experimentDatasetFilterOptions = datasets.data?.map((d) => ({
      value: d.id,
      displayValue: d.name,
    }));

    return {
      experimentDatasetId: experimentDatasetFilterOptions,
      scores_avg: filterOptions.data?.scores_avg ?? undefined,
      score_categories: scoreCategories,
    };
  }, [datasets.data, filterOptions.data]);

  return {
    filterOptions: experimentFilterOptions,
    isFilterOptionsPending: datasets.isLoading || filterOptions.isLoading,
  };
}
