import { buildMetricOptions } from "../utils/charts";

type ScoreColumn = { name: string; dataType: string };

/** Chart identities combine sources, matching the widget query aggregation. */
export function metricOptionsFromScoreColumns(
  observation: ScoreColumn[],
  experiment: ScoreColumn[],
) {
  const groupScoreNamesByDataType = (columns: ScoreColumn[]) => {
    const numeric = new Set(
      columns.filter((c) => c.dataType === "NUMERIC").map((c) => c.name),
    );
    const booleans = new Set(
      columns.filter((c) => c.dataType === "BOOLEAN").map((c) => c.name),
    );
    return {
      numeric: [...new Set([...numeric, ...booleans])],
      boolean: [...booleans].filter((name) => !numeric.has(name)),
      categorical: Object.fromEntries(
        columns
          .filter((c) => c.dataType === "CATEGORICAL")
          .map((c) => [c.name, [] as string[]]),
      ),
    };
  };
  const obs = groupScoreNamesByDataType(observation);
  const run = groupScoreNamesByDataType(experiment);
  return buildMetricOptions({
    obs_scores_avg: obs.numeric,
    obs_score_booleans: obs.boolean,
    obs_score_categories: obs.categorical,
    experiment_scores_avg: run.numeric,
    experiment_score_booleans: run.boolean,
    experiment_score_categories: run.categorical,
  });
}
