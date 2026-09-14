/**
 * The level-agnostic score-option shape shared by the experiment runs and items
 * surfaces. Kept free of query imports so it stays a pure, directly testable
 * projection.
 */

export type ScoreColumnDefinition = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};

type ProcessedScoreFilterOptions = {
  numeric: string[];
  boolean: string[];
  categorical: Array<{ label: string; values: string[] }>;
  scoreColumns: ScoreColumnDefinition[];
};

export type ScoreNameLevels = Record<string, ("observation" | "trace")[]>;

export type AgnosticScoreFilterOptions = {
  scores_avg: string[];
  score_categories: Array<{ label: string; values: string[] }>;
  score_booleans: string[];
  score_columns: ScoreColumnDefinition[];
  score_name_levels_numeric: ScoreNameLevels;
  score_name_levels_categorical: ScoreNameLevels;
  score_name_levels_boolean: ScoreNameLevels;
};

export type { ProcessedScoreFilterOptions };

/**
 * Projects the per-level score options into the one level-agnostic set the
 * three score facets offer, plus the level map that tags each offered name.
 *
 * The per-level shape stays the source — the run charts need it, because a
 * merged metric identity cannot say which level's series to plot. This is the
 * projection for filtering, where the level is not what the user is asking
 * about.
 *
 * Offered-set == matchable-set: every name here is one the level-agnostic
 * filter can match, and nothing else is offered. Experiment-level (dataset-run)
 * scores are deliberately absent — the observation-or-trace union can never
 * match them, so offering them would advertise a filter that cannot fire.
 *
 * The level map is SPLIT PER DATA TYPE because a name can be reused across
 * types at different levels (a numeric observation-level "accuracy" beside an
 * unrelated categorical trace-level one); a name-only map would mislabel both.
 */
export const toAgnosticScoreFilterOptions = (
  observation: ProcessedScoreFilterOptions,
  trace: ProcessedScoreFilterOptions,
): AgnosticScoreFilterOptions => {
  const levels = (
    pick: (options: ProcessedScoreFilterOptions) => string[],
  ): ScoreNameLevels => {
    const out: ScoreNameLevels = {};
    for (const name of pick(observation))
      (out[name] ??= []).push("observation");
    for (const name of pick(trace)) (out[name] ??= []).push("trace");
    return out;
  };

  const mergedCategorical = new Map<string, Set<string>>();
  for (const { label, values } of [
    ...observation.categorical,
    ...trace.categorical,
  ]) {
    const set = mergedCategorical.get(label) ?? new Set<string>();
    for (const value of values) set.add(value);
    mergedCategorical.set(label, set);
  }

  return {
    scores_avg: Array.from(
      new Set([...observation.numeric, ...trace.numeric]),
    ).sort(),
    score_booleans: Array.from(
      new Set([...observation.boolean, ...trace.boolean]),
    ).sort(),
    score_categories: Array.from(mergedCategorical, ([label, values]) => ({
      label,
      values: Array.from(values).sort(),
    })).sort((a, b) => a.label.localeCompare(b.label)),
    // Deduped: a name that exists at both levels is ONE column, not two.
    score_columns: Array.from(
      new Map(
        [...observation.scoreColumns, ...trace.scoreColumns].map((column) => [
          `${column.name}-${column.source}-${column.dataType}`,
          column,
        ]),
      ).values(),
    ),
    score_name_levels_numeric: levels((options) => options.numeric),
    score_name_levels_categorical: levels((options) =>
      options.categorical.map((entry) => entry.label),
    ),
    score_name_levels_boolean: levels((options) => options.boolean),
  };
};
