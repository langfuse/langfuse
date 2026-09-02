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
 * Experiment item filter options (scores) scoped to specific experiment IDs.
 * Returns the level-agnostic score filter options the three facets offer, plus
 * the per-level score column definitions the table's column visibility uses.
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
      // `projectId` arrives with `router.query` after hydration; without it in
      // the guard the query can fire with `undefined` and zod rejects it.
      enabled: Boolean(projectId) && experimentIds.length > 0,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );

  // Transform categorical scores into key-value format for sidebar filters
  const transformedOptions = useMemo(() => {
    if (!filterOptions.data) {
      return {
        scores_avg: undefined,
        score_categories: undefined,
        score_booleans: undefined,
        score_name_levels_numeric: undefined,
        score_name_levels_categorical: undefined,
        score_name_levels_boolean: undefined,
      } satisfies ExperimentItemScoreFilterOptions;
    }

    // One entry per score name across both levels; the level maps tag each
    // offered name with where it exists. `useSidebarFilterState` looks the maps
    // up by these exact keys.
    return {
      scores_avg: filterOptions.data.scores_avg,
      score_categories: processCategoricalScoreOptions(
        filterOptions.data.score_categories,
      ),
      score_booleans: filterOptions.data.score_booleans,
      score_name_levels_numeric: filterOptions.data.score_name_levels_numeric,
      score_name_levels_categorical:
        filterOptions.data.score_name_levels_categorical,
      score_name_levels_boolean: filterOptions.data.score_name_levels_boolean,
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
