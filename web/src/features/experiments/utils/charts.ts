import {
  BASE_CHART_IDS,
  CATEGORICAL_SCORE_CHART_CONFIG,
  EXPERIMENT_COST_WIDGET_CONFIG,
  EXPERIMENT_LATENCY_WIDGET_CONFIG,
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
const buildScoreChartId = (
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
    /^(obs|trace|experiment)-score-(numeric|categorical):(.+)$/,
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

function createScoreWidgetConfig(params: {
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

/** Order two entries for the same score name take: obs, trace, then run. */
const LEVEL_SORT_ORDER: ScoreLevel[] = ["obs", "trace", "experiment"];

/**
 * Build all available metric options from score filter options for the dropdown.
 *
 * The score metrics are ONE flat, alphabetical list: the level is a tag on the
 * entry, not a structural division, so the strip reads like the tracing tables'
 * level-agnostic score facets. A name recorded at two levels yields two
 * entries — each still plots exactly one level — sorted next to each other.
 * (LFE-15711)
 */
export function buildMetricOptions(
  scoreFilterOptions: ScoreFilterOptions,
): MetricOption[] {
  const scoreOptions = Object.values(SCORE_METRIC_SPECS).flatMap(
    ({ level, dataType, filterKey }) => {
      const scoreNames = getScoreNamesFromFilterOption(
        scoreFilterOptions[filterKey],
        dataType,
      );

      return scoreNames.map((scoreName) => ({
        id: buildScoreChartId(level, dataType, scoreName),
        label: scoreName,
        group: "Scores" as const,
        level,
      }));
    },
  );

  scoreOptions.sort(
    (a, b) =>
      a.label.localeCompare(b.label) ||
      LEVEL_SORT_ORDER.indexOf(a.level) - LEVEL_SORT_ORDER.indexOf(b.level),
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
