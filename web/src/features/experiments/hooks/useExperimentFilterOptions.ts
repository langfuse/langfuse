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

  const usedDatasets = useMemo(
    () =>
      datasets.data?.filter((d) =>
        filterOptions.data?.experimentDatasetIds?.includes(d.id),
      ),
    [datasets.data, filterOptions.data],
  );

  // Dataset names are unique per project, so the name IS the filter value —
  // no displayValue indirection, which is what let the sidebar show a name
  // while the search bar and the URL showed an opaque id.
  //
  // Both maps are built from EVERY dataset in the project, not from the
  // datasets the facet offers. The facet list comes from a bounded options
  // query, so a name missing from it would fail to translate and reach the
  // query as an id that matches nothing — a filter that silently returns no
  // rows. Offering fewer options than we can translate is fine; the reverse is
  // not.
  const datasetIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const dataset of datasets.data ?? [])
      map.set(dataset.name, dataset.id);
    return map;
  }, [datasets.data]);

  /** Rows carry the dataset id; the table renders its name. */
  const datasetNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const dataset of datasets.data ?? [])
      map.set(dataset.id, dataset.name);
    return map;
  }, [datasets.data]);

  const experimentFilterOptions = useMemo(() => {
    return {
      experimentDatasetName: usedDatasets?.map((d) => ({ value: d.name })),
      // Observation-level score options
      obs_scores_avg: filterOptions.data?.obs_scores_avg ?? undefined,
      obs_score_categories: processScoreCategories(
        filterOptions.data?.obs_score_categories,
      ),
      obs_score_booleans: filterOptions.data?.obs_score_booleans ?? undefined,
      // Trace-level score options
      trace_scores_avg: filterOptions.data?.trace_scores_avg ?? undefined,
      trace_score_categories: processScoreCategories(
        filterOptions.data?.trace_score_categories,
      ),
      trace_score_booleans:
        filterOptions.data?.trace_score_booleans ?? undefined,
    };
  }, [usedDatasets, filterOptions.data]);

  return {
    filterOptions: experimentFilterOptions,
    datasetIdByName,
    datasetNameById,
    isFilterOptionsPending: datasets.isLoading || filterOptions.isLoading,
  };
}
