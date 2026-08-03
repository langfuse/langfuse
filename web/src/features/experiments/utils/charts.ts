import {
  BASE_CHART_IDS,
  CATEGORICAL_SCORE_CHART_CONFIG,
  EXPERIMENT_COST_WIDGET_CONFIG,
  EXPERIMENT_LATENCY_WIDGET_CONFIG,
  MAX_CHARTS,
  NUMERIC_SCORE_CHART_CONFIG,
  SCORE_LEVEL_ENTITY_DIMENSIONS,
  SCORE_LEVEL_FILTERS,
  SCORE_METRIC_SPECS,
} from "@/src/features/experiments/constants/charts";
import type {
  MetricOption,
  ScoreChartDataType,
  ScoreFilterOptions,
  ScoreLevel,
} from "@/src/features/experiments/types/charts";

// Build chart ID from type and score name
export const buildScoreChartId = (
  level: ScoreLevel,
  dataType: "numeric" | "categorical",
  scoreName: string,
): string => `${level}-score-${dataType}:${scoreName}`;

// Parse chart ID to extract components
const parseScoreChartId = (
  chartId: string,
): {
  level: ScoreLevel;
  dataType: "numeric" | "categorical";
  scoreName: string;
} | null => {
  const match = chartId.match(
    /^(obs|experiment)-score-(numeric|categorical):(.+)$/,
  );
  if (!match) return null;
  return {
    level: match[1] as ScoreLevel,
    dataType: match[2] as "numeric" | "categorical",
    scoreName: match[3],
  };
};

function getScoreNamesFromFilterOption(
  value: string[] | Record<string, string[]> | undefined,
  dataType: ScoreChartDataType,
): string[] {
  if (!value) return [];
  return dataType === "numeric"
    ? (value as string[])
    : Object.keys(value as Record<string, string[]>);
}

export function createScoreWidgetConfig(params: {
  level: ScoreLevel;
  dataType: "numeric" | "categorical";
  scoreName: string;
}) {
  const levelFilters = SCORE_LEVEL_FILTERS[params.level];

  // Filter by score name AND level
  const scoreNameFilter = {
    column: "name" as const,
    operator: "=" as const,
    value: params.scoreName,
    type: "string" as const,
  };

  return {
    ...(params.dataType === "numeric"
      ? NUMERIC_SCORE_CHART_CONFIG
      : CATEGORICAL_SCORE_CHART_CONFIG),
    entityDimension: SCORE_LEVEL_ENTITY_DIMENSIONS[params.level],
    filters: [...levelFilters, scoreNameFilter],
  };
}

/**
 * Build widget config from a chart ID.
 * Works for both base charts and score charts (parsed from ID).
 */
export function buildWidgetConfigFromId(chartId: string) {
  // Base charts
  if (chartId === BASE_CHART_IDS.COST) {
    return EXPERIMENT_COST_WIDGET_CONFIG;
  }
  if (chartId === BASE_CHART_IDS.LATENCY) {
    return EXPERIMENT_LATENCY_WIDGET_CONFIG;
  }

  // Score charts - parse ID to get score name and level
  const parsed = parseScoreChartId(chartId);
  if (!parsed) return null;

  const { level, dataType, scoreName } = parsed;

  return createScoreWidgetConfig({
    level,
    dataType,
    scoreName,
  });
}

/**
 * Get smart default charts based on available scores.
 * Starts with Cost and Latency.
 */
export function getDefaultCharts(): string[] {
  return [BASE_CHART_IDS.COST, BASE_CHART_IDS.LATENCY];
}

/**
 * Build all available metric options from score filter options for the dropdown.
 */
export function buildMetricOptions(
  scoreFilterOptions: ScoreFilterOptions,
): MetricOption[] {
  const scoreOptions = Object.values(SCORE_METRIC_SPECS).flatMap(
    ({ level, dataType, filterKey, group }) => {
      const scoreNames = getScoreNamesFromFilterOption(
        scoreFilterOptions[filterKey],
        dataType,
      );

      return scoreNames.map((scoreName) => ({
        id: buildScoreChartId(level, dataType, scoreName),
        label: scoreName,
        group,
      }));
    },
  );

  return [
    {
      id: BASE_CHART_IDS.COST,
      label: "Cost ($)",
      group: "Base Metrics",
    },
    {
      id: BASE_CHART_IDS.LATENCY,
      label: "Latency (ms)",
      group: "Base Metrics",
    },
    ...scoreOptions,
  ];
}

/**
 * Validate that stored data is a valid ChartSelection (array of strings, max 4).
 */
export function isValidChartSelection(data: unknown): data is string[] {
  if (!Array.isArray(data)) return false;
  if (data.length > MAX_CHARTS) return false;
  return data.every((item) => typeof item === "string" && item.length > 0);
}
