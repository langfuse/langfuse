import { type ScoreComparisonOperator } from "@/src/features/experiments/fns/scoreComparisonFilter";

/**
 * Experiments-UI PostHog payloads. Metadata only — counts, enums, booleans,
 * field names. Never experiment/dataset names, score values, or item content.
 */

type ExperimentTableName = "experiments" | "experiment-items";

const EXPERIMENT_ANALYTICS_IS_V4 = true as const;

export type ExperimentComparisonSource =
  | "picker"
  | "table-selection"
  | "url"
  /** The comparison the page selects for you when none is in the URL. Kept
   *  separate so it cannot make it look as though everyone started comparing. */
  | "auto";
export type ExperimentBaselineSource = "picker" | "table-selection" | "clear";
export type ExperimentScoreScope = "trace" | "observation" | "experiment";
export type ExperimentChartMetricGroup = "base" | "score";

type ExperimentAnalyticsDimensions = {
  isV4: typeof EXPERIMENT_ANALYTICS_IS_V4;
  tableName: ExperimentTableName;
};

function experimentAnalyticsDimensions(
  tableName: ExperimentTableName,
): ExperimentAnalyticsDimensions {
  return { isV4: EXPERIMENT_ANALYTICS_IS_V4, tableName };
}

/** Unique non-empty dataset ids — missing ids are ignored, not treated as distinct. */
export function isSameDataset(
  datasetIds: Array<string | null | undefined>,
): boolean {
  const known = datasetIds.filter((id): id is string => Boolean(id));
  if (known.length <= 1) return true;
  return known.every((id) => id === known[0]);
}

export function uniqueDatasetCount(
  datasetIds: Array<string | null | undefined>,
): number {
  return new Set(datasetIds.filter((id): id is string => Boolean(id))).size;
}

export function chartMetricGroup(metricId: string): ExperimentChartMetricGroup {
  return metricId.startsWith("base:") ? "base" : "score";
}

const SCORE_COLUMN_GROUP_SCOPE: Record<string, ExperimentScoreScope> = {
  traceItemScores: "trace",
  traceScores: "trace",
  observationItemScores: "observation",
  observationScores: "observation",
  experimentScores: "experiment",
};

export function scoreColumnGroupScope(
  groupId: string,
): ExperimentScoreScope | null {
  return SCORE_COLUMN_GROUP_SCOPE[groupId] ?? null;
}

export function comparisonChangedProps({
  tableName,
  comparisonCount,
  datasetIds,
  source,
}: {
  tableName: ExperimentTableName;
  comparisonCount: number;
  datasetIds: Array<string | null | undefined>;
  source: ExperimentComparisonSource;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    comparisonCount,
    isSameDataset: isSameDataset(datasetIds),
    source,
  };
}

export function comparisonPickerOpenedProps({
  tableName,
  optionCount,
  datasetIds,
  queryLength,
}: {
  tableName: ExperimentTableName;
  optionCount: number;
  datasetIds: Array<string | null | undefined>;
  queryLength: number;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    optionCount,
    datasetCount: uniqueDatasetCount(datasetIds),
    hasSearchQuery: queryLength > 0,
    queryLength,
  };
}

export function baselineChangedProps({
  tableName,
  source,
}: {
  tableName: ExperimentTableName;
  source: ExperimentBaselineSource;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    source,
  };
}

/**
 * `chart_metric_changed` — the metric behind the list's compact metric strip.
 * Inherited from the four-slot chart grid this replaced, so the event name and
 * its history carry over; `chartIndex`/`slotCount` are gone with the slots.
 *
 * The score's NAME is user content and never leaves the client — only which
 * family of metric it is, at which score level, of which type. The level is the
 * interesting half: trace-level is where an LLM-as-judge on a dataset run
 * writes, and it only became selectable here at all in this change.
 */
export function chartMetricChangedProps({
  tableName,
  metricId,
}: {
  tableName: ExperimentTableName;
  metricId: string;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    metricGroup: chartMetricGroup(metricId),
    ...scoreMetricShape(metricId),
  };
}

/** `<level>-score-<dataType>:<scoreName>` — the shape, never the name. */
function scoreMetricShape(metricId: string): {
  scoreLevel: "observation" | "trace" | "experiment" | "none";
  dataType: "numeric" | "categorical" | "none";
} {
  const match = metricId.match(
    /^(obs|trace|experiment)-score-(numeric|categorical):/,
  );
  if (!match) return { scoreLevel: "none", dataType: "none" };
  const level =
    match[1] === "obs" ? "observation" : (match[1] as "trace" | "experiment");
  return { scoreLevel: level, dataType: match[2] as "numeric" | "categorical" };
}

export function scoreColumnScopeToggledProps({
  tableName,
  groupId,
  enabledCount,
}: {
  tableName: ExperimentTableName;
  groupId: string;
  enabledCount: number;
}) {
  const scope = scoreColumnGroupScope(groupId);
  if (!scope) return null;
  return {
    ...experimentAnalyticsDimensions(tableName),
    scope,
    enabledCount,
  };
}

/**
 * `item_regression_filter_applied` — "keep the items whose score got worse than
 * the comparison". Inherited from the event that measured retargeting an item
 * filter at another run, because it answers the same question with a filter
 * that can finally express it.
 *
 * `comparisonIndex` is the filter's target position among the selected
 * comparisons, so a payload never carries an experiment id. There is no
 * `column`: on this surface the filtered column IS a score, and a score name is
 * user content — `scoreLevel` + `dataType` describe it instead.
 */
export function itemRegressionFilterAppliedProps({
  tableName,
  scoreLevel,
  dataType,
  operator,
  comparisonExperimentId,
  comparisonIds,
  source,
}: {
  tableName: ExperimentTableName;
  scoreLevel: ExperimentScoreComparisonLevel;
  dataType: string | undefined;
  operator: ExperimentScoreComparisonOperator;
  comparisonExperimentId: string;
  comparisonIds: string[];
  source: ExperimentScoreComparisonSource;
}) {
  const comparisonIndex = comparisonIds.indexOf(comparisonExperimentId);
  // The filter points at a run that is not among the compared ones, which a
  // shared URL can outlive. The table treats such a filter as inactive, so
  // there is no applied filter to report and an out-of-range index would only
  // be noise: the caller skips the event.
  if (comparisonIndex < 0) return null;

  return {
    ...experimentAnalyticsDimensions(tableName),
    scoreLevel,
    dataType: dataType ?? "unknown",
    operator,
    comparisonIndex,
    source,
  };
}

/** Which score family the filtered column belongs to. */
export type ExperimentScoreComparisonLevel = "observation" | "trace";

/** `differs` reads as an implementation word; the tracking plan says `different`. */
export type ExperimentScoreComparisonOperator =
  | "lower"
  | "higher"
  | "different";

/** The domain operator as PostHog sees it. */
export const COMPARISON_OPERATOR_PROPERTY: Record<
  ScoreComparisonOperator,
  ExperimentScoreComparisonOperator
> = {
  lower: "lower",
  higher: "higher",
  differs: "different",
};

/** A deliberate pick from the score header's menu, or a shared URL. */
export type ExperimentScoreComparisonSource = "header_menu" | "url";

/**
 * `layout_changed` — is the transposed score matrix adopted? Captured on the
 * menu pick rather than on the URL state, which also changes on navigation and
 * on a restored view.
 */
export function layoutChangedProps({
  tableName,
  layout,
  comparisonCount,
}: {
  tableName: ExperimentTableName;
  layout: string;
  comparisonCount: number;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    layout,
    comparisonCount,
  };
}

/** `diff_mode_changed` — and is `Expected → Output` used at all? */
export function diffModeChangedProps({
  tableName,
  mode,
  comparisonCount,
}: {
  tableName: ExperimentTableName;
  mode: string;
  comparisonCount: number;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    mode,
    comparisonCount,
  };
}

/**
 * `auto_comparison_preference_changed` — the escape hatch on the auto-selected
 * comparison. Turning it off is the signal that the default guessed wrong.
 */
export function autoComparisonPreferenceChangedProps({
  tableName,
  isEnabled,
}: {
  tableName: ExperimentTableName;
  isEnabled: boolean;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    isEnabled,
  };
}
