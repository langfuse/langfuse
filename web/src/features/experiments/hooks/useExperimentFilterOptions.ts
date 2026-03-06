import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { type FilterState, type TimeFilter } from "@langfuse/shared";

// Process categorical scores into key-value format
const processScoreCategories = (
  categories: Array<{ label: string; values: string[] }> | undefined,
) =>
  categories?.reduce(
    (acc, score) => {
      acc[score.label] = score.values;
      return acc;
    },
    {} as Record<string, string[]>,
  ) ?? undefined;

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
    const experimentDatasetFilterOptions = datasets.data
      ?.filter((d) => filterOptions.data?.experimentDatasetIds?.includes(d.id))
      .map((d) => ({
        value: d.id,
        displayValue: d.name,
      }));

    return {
      experimentDatasetId: experimentDatasetFilterOptions,
      // Observation-level score options
      obs_scores_avg: filterOptions.data?.obs_scores_avg ?? undefined,
      obs_score_categories: processScoreCategories(
        filterOptions.data?.obs_score_categories,
      ),
      // Trace-level score options
      trace_scores_avg: filterOptions.data?.trace_scores_avg ?? undefined,
      trace_score_categories: processScoreCategories(
        filterOptions.data?.trace_score_categories,
      ),
    };
  }, [datasets.data, filterOptions.data]);

  return {
    filterOptions: experimentFilterOptions,
    isFilterOptionsPending: datasets.isLoading || filterOptions.isLoading,
  };
}
