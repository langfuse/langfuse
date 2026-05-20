import { api } from "@/src/utils/api";
import { useMemo } from "react";

export type ScoreColumnDef = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};

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
        trace_scores_avg: undefined,
        trace_score_categories: undefined,
      };
    }

    const processCategoricalScores = (
      categories: Array<{ label: string; values: string[] }>,
    ): Record<string, string[]> =>
      categories.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      );

    return {
      obs_scores_avg: filterOptions.data.obs_scores_avg,
      obs_score_categories: processCategoricalScores(
        filterOptions.data.obs_score_categories,
      ),
      trace_scores_avg: filterOptions.data.trace_scores_avg,
      trace_score_categories: processCategoricalScores(
        filterOptions.data.trace_score_categories,
      ),
    };
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
