import { api, type RouterOutputs } from "@/src/utils/api";
import { useMemo } from "react";
import { type ExperimentItemScoreFilterOptions } from "@/src/features/experiments/types/charts";

const EXPERIMENT_ITEM_LEVEL_OPTIONS = ["DEBUG", "DEFAULT", "WARNING", "ERROR"];

/** Fetch the combined score options for the selected experiments. */
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

type ItemFilterOptions = RouterOutputs["experiments"]["itemsFilterOptions"];

export type ScoreColumnDef = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};
