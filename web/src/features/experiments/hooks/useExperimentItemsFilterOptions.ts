import { api, type RouterOutputs } from "@/src/utils/api";
import { useMemo } from "react";
import { type ExperimentItemScoreFilterOptions } from "@/src/features/experiments/types/charts";

const EXPERIMENT_ITEM_LEVEL_OPTIONS = ["DEBUG", "DEFAULT", "WARNING", "ERROR"];

/** Fetch aggregate and target-specific score options in one request. */
export const useExperimentItemsFilterOptions = ({
  projectId,
  experimentIds,
}: {
  projectId: string;
  experimentIds: string[];
}) => {
  const filterOptions = api.experiments.itemsFilterOptions.useQuery(
    { projectId, experimentIds },
    {
      enabled: Boolean(projectId) && experimentIds.length > 0,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );

  const transformedOptions = useMemo(
    () => toFilterOptions(filterOptions.data),
    [filterOptions.data],
  );

  const optionsByExperiment = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(
          filterOptions.isError ? {} : (filterOptions.data?.byExperiment ?? {}),
        ).map(([id, options]) => [id, toFilterOptions(options)]),
      ) as Record<string, ExperimentItemScoreFilterOptions | undefined>,
    [filterOptions.data, filterOptions.isError],
  );

  const scoreColumns = useMemo(
    () => ({
      observationScoreColumns: filterOptions.data?.obs_score_columns ?? [],
      traceScoreColumns: filterOptions.data?.trace_score_columns ?? [],
    }),
    [filterOptions.data],
  );

  function retry() {
    return filterOptions.refetch();
  }

  return {
    filterOptions: transformedOptions,
    scoreColumns,
    optionsByExperiment,
    isLoading: filterOptions.isLoading,
    error: filterOptions.isError
      ? "Score filter options could not be loaded. Retry to edit score filters."
      : null,
    retry,
  };
};

function toFilterOptions(
  data: ItemFilterOptions | undefined,
): ExperimentItemScoreFilterOptions {
  return {
    scores_avg: data?.scores_avg,
    score_categories: data
      ? Object.fromEntries(
          data.score_categories.map(({ label, values }) => [label, values]),
        )
      : undefined,
    score_booleans: data?.score_booleans,
    score_name_levels_numeric: data?.score_name_levels_numeric,
    score_name_levels_categorical: data?.score_name_levels_categorical,
    score_name_levels_boolean: data?.score_name_levels_boolean,
    level: EXPERIMENT_ITEM_LEVEL_OPTIONS,
  };
}

type ItemFilterOptions =
  RouterOutputs["experiments"]["itemsFilterOptions"]["byExperiment"][string];

export type ScoreColumnDef = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};
