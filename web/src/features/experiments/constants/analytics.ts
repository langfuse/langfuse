import { type ScoreComparisonOperator } from "@/src/features/experiments/fns/scoreComparisonFilter";

/**
 * Experiments only exist behind the v4 beta (`useExperimentAccess` gates the
 * whole area), so the headline v3-vs-v4 dimension is a constant here rather
 * than something to derive per surface. Spread it into every `experiment:*`
 * capture so the dimension cannot silently go missing on a new event.
 * (LFE-15720)
 */
export const EXPERIMENT_ANALYTICS_DIMENSIONS = { isV4: true } as const;

/** Which score family an event is about, in full words (the column ids use an
 *  `obs` shorthand) so the property reads the same on every event. */
export type ExperimentScoreScope = "trace" | "observation" | "experiment";

/** Where a comparison selection came from — the property that keeps the
 *  auto-selected default and a shared link out of the "users compare" number. */
export type ExperimentComparisonSource =
  | "picker"
  | "table_selection"
  | "url"
  | "auto";

/** How a baseline was set: the control's combobox, or its clear button. */
export type ExperimentBaselineSource = "picker" | "cleared";

/**
 * The strip's metric ids are `base:cost` / `base:latency` or
 * `<level>-score-<dataType>:<scoreName>`. Only the shape is reported: the score
 * NAME is user content and never leaves the client.
 */
export const describeStripMetric = (metricId: string) => {
  const level = metricId.match(/^(obs|trace|experiment)-score-/)?.[1];
  if (!level) return { metricGroup: "base", scoreLevel: "none" };
  return {
    metricGroup: "score",
    scoreLevel: level === "obs" ? "observation" : level,
  };
};

/**
 * The comparison operator as PostHog sees it. `differs` reads as an
 * implementation word; the tracking plan says `different`.
 */
export const COMPARISON_OPERATOR_PROPERTY: Record<
  ScoreComparisonOperator,
  "lower" | "higher" | "different"
> = {
  lower: "lower",
  higher: "higher",
  differs: "different",
};
