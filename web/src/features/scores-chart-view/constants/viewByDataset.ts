import { type ScoreChartDataset } from "@/src/features/scores-chart-view/types";

/**
 * The view a config's `dataset` queries — one-to-one with the three score
 * views the query engine exposes (`packages/shared/src/features/query/
 * dataModel.ts`) and the same three-way split `viewLabels`
 * (`@/src/features/monitors/helpers/monitorLabels`) and the experiments
 * filter config already use. Its own file so both `buildScoresChartQuery`
 * and `scoreDimensions` (which reads `viewDeclarations[view]` directly) can
 * import it without one depending on the other.
 */
export const VIEW_BY_DATASET = {
  numeric: "scores-numeric",
  boolean: "scores-boolean",
  categorical: "scores-categorical",
} as const satisfies Record<ScoreChartDataset, string>;
