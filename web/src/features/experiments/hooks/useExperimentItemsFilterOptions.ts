import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { type ExperimentItemScoreFilterOptions } from "@/src/features/experiments/types/charts";

export type ScoreColumnDef = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};

const processCategoricalScoreOptions = (
  categories: Array<{ label: string; values: string[] }>,
): Record<string, string[]> =>
  categories.reduce(
    (acc, score) => {
      acc[score.label] = score.values;
      return acc;
    },
    {} as Record<string, string[]>,
  );

/**
 * Hook to fetch experiment item filter options (scores) scoped to specific experiment IDs.
 * Returns score filter options for both observation-level and trace-level scores,
 * plus full score column definitions for table column visibility.
 */
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
      enabled: experimentIds.length > 0,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );

  // Transform categorical scores into key-value format for sidebar filters
  const transformedOptions = useMemo(() => {
    if (!filterOptions.data) {
      return {
        obs_scores_avg: undefined,
        obs_score_categories: undefined,
        obs_score_booleans: undefined,
        trace_scores_avg: undefined,
        trace_score_categories: undefined,
        trace_score_booleans: undefined,
      } satisfies ExperimentItemScoreFilterOptions;
    }

    return {
      obs_scores_avg: filterOptions.data.obs_scores_avg,
      obs_score_categories: processCategoricalScoreOptions(
        filterOptions.data.obs_score_categories,
      ),
      obs_score_booleans: filterOptions.data.obs_score_booleans,
      trace_scores_avg: filterOptions.data.trace_scores_avg,
      trace_score_categories: processCategoricalScoreOptions(
        filterOptions.data.trace_score_categories,
      ),
      trace_score_booleans: filterOptions.data.trace_score_booleans,
    } satisfies ExperimentItemScoreFilterOptions;
  }, [filterOptions.data]);

  // Extract score column definitions for table columns
  const scoreColumns = useMemo(
    () => ({
      observationScoreColumns: (filterOptions.data?.obs_score_columns ??
        []) as ScoreColumnDef[],
      traceScoreColumns: (filterOptions.data?.trace_score_columns ??
        []) as ScoreColumnDef[],
    }),
    [filterOptions.data],
  );

  return {
    filterOptions: transformedOptions,
    scoreColumns,
    isLoading: filterOptions.isLoading,
  };
};
