import { api, type RouterOutputs } from "@/src/utils/api";
import { useMemo } from "react";
import { type ExperimentItemScoreFilterOptions } from "@/src/features/experiments/types/charts";

export type ScoreColumnDef = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};

const EXPERIMENT_ITEM_LEVEL_OPTIONS = ["DEBUG", "DEFAULT", "WARNING", "ERROR"];

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

function toFilterOptions(
  data: RouterOutputs["experiments"]["itemsFilterOptions"] | undefined,
): ExperimentItemScoreFilterOptions {
  return {
    scores_avg: data?.scores_avg,
    score_categories: data
      ? processCategoricalScoreOptions(data.score_categories)
      : undefined,
    score_booleans: data?.score_booleans,
    score_name_levels_numeric: data?.score_name_levels_numeric,
    score_name_levels_categorical: data?.score_name_levels_categorical,
    score_name_levels_boolean: data?.score_name_levels_boolean,
    level: EXPERIMENT_ITEM_LEVEL_OPTIONS,
  };
}

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

  const transformedOptions = useMemo(
    () => toFilterOptions(filterOptions.data),
    [filterOptions.data],
  );

  // Score names and their types can differ between experiments. Suggestions
  // and validation must use the options for the condition's own target.
  const optionsByExperiment = api.useQueries(
    (t) =>
      experimentIds.map((experimentId) =>
        t.experiments.itemsFilterOptions(
          { projectId, experimentIds: [experimentId] },
          {
            enabled: Boolean(projectId),
            staleTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          },
        ),
      ),
    {
      combine: (results) =>
        Object.fromEntries(
          results.map((result, index) => [
            experimentIds[index],
            result.data ? toFilterOptions(result.data) : undefined,
          ]),
        ) as Record<string, ExperimentItemScoreFilterOptions | undefined>,
    },
  );

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
    optionsByExperiment,
    isLoading: filterOptions.isLoading,
  };
};
