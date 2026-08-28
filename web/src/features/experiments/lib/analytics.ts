/**
 * Experiments-UI PostHog payloads. Metadata only — counts, enums, booleans,
 * field names. Never experiment/dataset names, score values, or item content.
 */

type ExperimentTableName = "experiments" | "experiment-items";

const EXPERIMENT_ANALYTICS_IS_V4 = true as const;

export type ExperimentComparisonSource = "picker" | "table-selection" | "url";
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

export function chartMetricChangedProps({
  tableName,
  metricId,
  chartIndex,
  slotCount,
}: {
  tableName: ExperimentTableName;
  metricId: string;
  chartIndex: number;
  slotCount: number;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    metricGroup: chartMetricGroup(metricId),
    chartIndex,
    slotCount,
  };
}

export function chartsSectionToggledProps({
  tableName,
  isExpanded,
}: {
  tableName: ExperimentTableName;
  isExpanded: boolean;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    isExpanded,
  };
}

export function analyticsTabOpenedProps({
  tableName,
  hasComparison,
}: {
  tableName: ExperimentTableName;
  hasComparison: boolean;
}) {
  return {
    ...experimentAnalyticsDimensions(tableName),
    hasComparison,
  };
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

export function itemRegressionFilterAppliedProps({
  tableName,
  column,
  operator,
  toExperimentId,
  baselineId,
  comparisonIds,
}: {
  tableName: ExperimentTableName;
  column: string;
  operator: string;
  toExperimentId: string;
  baselineId: string | undefined;
  comparisonIds: string[];
}): {
  isV4: true;
  tableName: ExperimentTableName;
  column: string;
  comparisonIndex: number;
  operator: string;
} | null {
  if (!baselineId || toExperimentId === baselineId) return null;
  const comparisonIndex = comparisonIds.indexOf(toExperimentId);
  if (comparisonIndex < 0) return null;
  return {
    ...experimentAnalyticsDimensions(tableName),
    column,
    comparisonIndex,
    operator,
  };
}
