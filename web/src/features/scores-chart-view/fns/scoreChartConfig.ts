import { type FilterState, type QueryType } from "@langfuse/shared";
import {
  AGGREGATION_LABELS,
  CHART_TYPES,
  GRANULARITIES,
  isTimeSeriesChartType,
} from "@/src/features/chart-view/vocab";
import { type ChartWidgetInput } from "@/src/features/chart-view/lib/chartConfigToWidget";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";
import { getScoreDimensionsForDataset } from "@/src/features/scores-chart-view/constants/scoreDimensions";
import {
  getScoreMetricsForDataset,
  SCORE_METRICS,
} from "@/src/features/scores-chart-view/constants/scoreMetrics";
import { VIEW_BY_DATASET } from "@/src/features/scores-chart-view/constants/viewByDataset";
import {
  type ScoreChartDataset,
  type ScoreChartViewConfig,
  type ScoreDimensionDef,
  type ScoreDimensionKey,
  type ScoreMetricDef,
  type ScoreMetricKey,
} from "@/src/features/scores-chart-view/types";

/**
 * Everything that reads or derives from a `ScoreChartViewConfig` — one
 * module because these functions are small, call each other constantly, and
 * are never used independently of the config they all take. Mirrors the
 * observations chart view's equivalent surface
 * (`@/src/features/chart-view/vocab` + `lib/buildChartQuery` +
 * `lib/chartConfigToWidget`), just consolidated into a single file instead
 * of split across three.
 */

// ---------------------------------------------------------------------------
// Metric / dimension lookups
// ---------------------------------------------------------------------------

/**
 * `key` alone doesn't uniquely identify a metric — "count" exists on every
 * dataset (see `SCORE_METRICS`) — so `dataset` disambiguates which view's
 * definition to use.
 */
export const getScoreMetric = (
  key: ScoreMetricKey,
  dataset: ScoreChartDataset,
): ScoreMetricDef =>
  SCORE_METRICS.find((m) => m.key === key && m.dataset === dataset) ??
  SCORE_METRICS.find((m) => m.dataset === dataset) ??
  SCORE_METRICS[0];

/**
 * `key` alone doesn't uniquely identify a dimension across datasets (the
 * dimension list is per-view, see `getScoreDimensionsForDataset`), so
 * `dataset` disambiguates which view's list to look in.
 */
const getScoreDimension = (
  key: ScoreDimensionKey,
  dataset: ScoreChartDataset,
  isTimeSeries: boolean,
): ScoreDimensionDef => {
  const options = getScoreDimensionsForDataset(dataset, isTimeSeries);
  return options.find((d) => d.key === key) ?? options[0];
};

/** The executeQuery column name for a metric, e.g. `avg_value`, `count_count`. */
export const scoreMetricField = (config: ScoreChartViewConfig): string =>
  `${config.aggregation}_${getScoreMetric(config.metric, config.dataset).measure}`;

// ---------------------------------------------------------------------------
// Config validation / description
// ---------------------------------------------------------------------------

/**
 * Coerces a config to a valid, internally-consistent spec — same contract as
 * the observations chart view's `coerceConfig`: every field clamped to a
 * known enum member (untrusted URL params), and the aggregation reset when
 * the metric changed underneath it.
 */
export const coerceScoreChartConfig = (
  config: ScoreChartViewConfig,
): ScoreChartViewConfig => {
  // A stale two-way ternary here previously clamped "boolean" straight back
  // down to "numeric" on every config update, silently making the boolean
  // view unselectable no matter what the picker offered.
  const dataset: ScoreChartDataset =
    config.dataset === "boolean" || config.dataset === "categorical"
      ? config.dataset
      : "numeric";
  const datasetMetrics = getScoreMetricsForDataset(dataset);
  // The metric may not exist on the new dataset (e.g. switching from
  // "numeric" while "value" is selected — categorical scores have no value
  // measure), so fall back to that dataset's first metric rather than the
  // global default.
  const metric = datasetMetrics.some((m) => m.key === config.metric)
    ? getScoreMetric(config.metric, dataset)
    : datasetMetrics[0];
  const aggregation = metric.aggregations.includes(config.aggregation)
    ? config.aggregation
    : metric.aggregations[0];
  const chartType = CHART_TYPES.some((c) => c.value === config.chartType)
    ? config.chartType
    : CHART_TYPES[0].value;
  // Resolved before the breakdown check below: switching TO a time-series
  // chart type must also re-validate a highCardinality breakdown the user
  // had picked on a ranked/pie/number chart, or the next query 422s.
  const isTimeSeries = isTimeSeriesChartType(chartType);
  const datasetDimensions = getScoreDimensionsForDataset(dataset, isTimeSeries);
  const breakdown = datasetDimensions.some((d) => d.key === config.breakdown)
    ? config.breakdown
    : "none";
  const timeGranularity = GRANULARITIES.includes(config.timeGranularity)
    ? config.timeGranularity
    : "hour";
  return {
    dataset,
    metric: metric.key,
    aggregation,
    breakdown,
    chartType,
    timeGranularity,
  };
};

/** Human sentence describing a config — the chart subtitle. */
export const describeScoreChartConfig = (
  config: ScoreChartViewConfig,
): string => {
  const metric = getScoreMetric(config.metric, config.dataset);
  const metricPart =
    config.metric === "count"
      ? "Count of scores"
      : `${AGGREGATION_LABELS[config.aggregation]} ${metric.label.toLowerCase()}`;
  const byPart =
    config.breakdown === "none" || config.chartType === "NUMBER"
      ? ""
      : ` by ${getScoreDimension(
          config.breakdown,
          config.dataset,
          isTimeSeriesChartType(config.chartType),
        ).label.toLowerCase()}`;
  const timePart = isTimeSeriesChartType(config.chartType) ? " over time" : "";
  return `${metricPart}${byPart}${timePart}`;
};

// ---------------------------------------------------------------------------
// Query building / row mapping / widget export
// ---------------------------------------------------------------------------

/** Ranked/pie charts (and widgets) show a top-N slice. */
const CATEGORICAL_ROW_LIMIT = 20;

/**
 * `scores-numeric` also carries BOOLEAN scores (its segment allow-lists both
 * NUMERIC and BOOLEAN), so every dataset gets its own `dataType` filter
 * appended — numeric to exclude boolean scores, boolean/categorical
 * redundantly with their own view segment. Appended, not replacing: if the
 * table's own Data Type filter conflicts with the dataset (e.g. filtered to
 * BOOLEAN while viewing the numeric chart), the two AND together to zero
 * rows, and the chart shows "No data" — an honest answer, instead of
 * silently overriding the user's filter to show unrelated data.
 */
const DATASET_DATA_TYPE: Record<ScoreChartDataset, string> = {
  numeric: "NUMERIC",
  boolean: "BOOLEAN",
  categorical: "CATEGORICAL",
};

const scopeFiltersToDataset = (
  filters: FilterState,
  dataset: ScoreChartDataset,
): FilterState => [
  ...filters,
  {
    column: "dataType",
    operator: "=" as const,
    value: DATASET_DATA_TYPE[dataset],
    type: "string" as const,
  },
];

/**
 * Builds the dashboard `QueryType` for a scores chart-view config. Mirrors
 * `buildChartQuery` (the observations chart view) and the existing "Scores"
 * dashboard widgets — same views, same shape. `filters` should already be
 * mapped onto the config's dataset view, e.g. via
 * `mapLegacyUiTableFilterToView("scores-numeric" | "scores-boolean" | "scores-categorical", ...)`.
 */
export function buildScoresChartQuery({
  config,
  filters,
  fromTimestamp,
  toTimestamp,
}: {
  config: ScoreChartViewConfig;
  filters: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
}): QueryType {
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const metric = getScoreMetric(config.metric, config.dataset);
  const dimension = getScoreDimension(
    config.breakdown,
    config.dataset,
    isTimeSeries,
  );
  const isNumber = config.chartType === "NUMBER";

  const dimensions =
    !isNumber && dimension.field ? [{ field: dimension.field }] : [];

  const isCategoricalBreakdown =
    !isTimeSeries && !isNumber && dimensions.length > 0;
  const field = scoreMetricField(config);

  return {
    view: VIEW_BY_DATASET[config.dataset],
    dimensions,
    metrics: [{ measure: metric.measure, aggregation: config.aggregation }],
    filters: scopeFiltersToDataset(filters, config.dataset),
    timeDimension: isTimeSeries ? { granularity: "auto" } : null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: isCategoricalBreakdown
      ? [{ field, direction: "desc" as const }]
      : null,
    chartConfig: isCategoricalBreakdown
      ? { type: config.chartType, row_limit: CATEGORICAL_ROW_LIMIT }
      : { type: config.chartType },
  };
}

/** Stringify a raw dimension cell the way the widget charts do. */
function dimensionValue(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "n/a";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(", ");
  return String(raw);
}

/**
 * Turns `executeQuery` rows into chart-library `DataPoint[]` for a config —
 * the inverse of `buildScoresChartQuery`. Mirrors the observations chart
 * view's `rowsToDataPoints`.
 */
export function scoreRowsToDataPoints(
  rows: Array<Record<string, unknown>>,
  config: ScoreChartViewConfig,
): DataPoint[] {
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const metric = getScoreMetric(config.metric, config.dataset);
  const dimension = getScoreDimension(
    config.breakdown,
    config.dataset,
    isTimeSeries,
  );
  const field = scoreMetricField(config);
  const isNumber = config.chartType === "NUMBER";
  const hasBreakdown = !isNumber && dimension.field !== null;

  return rows.map((row) => {
    const time_dimension = row["time_dimension"] as string | undefined;
    const value = row[field];

    if (isTimeSeries && hasBreakdown) {
      const rawDim = row[dimension.field as string];
      const isFiller =
        value == null ||
        (getWidgetMissingBucketValue(config.aggregation) === "zero" &&
          Number(value) === 0);
      if ((rawDim === null || rawDim === "") && isFiller) {
        return { time_dimension, dimension: undefined, metric: null };
      }
    }

    const dim = hasBreakdown
      ? dimensionValue(row[dimension.field as string])
      : isNumber
        ? undefined
        : metric.label;
    const metricValue = Array.isArray(value)
      ? value
      : isTimeSeries && value == null
        ? null
        : Number(value ?? 0);
    return { time_dimension, dimension: dim, metric: metricValue };
  });
}

/**
 * Maps a scores chart-view config (+ the filters the chart is showing) to the
 * input of the EXISTING `dashboardWidgets.create` mutation — same bridge the
 * observations chart view uses (`chartConfigToWidgetInput`), so "Add to
 * dashboard" reuses the widget-creation flow instead of duplicating it.
 */
export function scoreChartConfigToWidgetInput({
  config,
  filters,
}: {
  config: ScoreChartViewConfig;
  filters: FilterState;
}): ChartWidgetInput {
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const metric = getScoreMetric(config.metric, config.dataset);
  const dimension = getScoreDimension(
    config.breakdown,
    config.dataset,
    isTimeSeries,
  );
  const isNumber = config.chartType === "NUMBER";

  const dimensions =
    !isNumber && dimension.field ? [{ field: dimension.field }] : [];
  const metrics = [{ measure: metric.measure, agg: config.aggregation }];

  const isCategoricalBreakdown =
    !isTimeSeries && !isNumber && dimensions.length > 0;

  const chartConfig = (
    isCategoricalBreakdown
      ? { type: config.chartType, row_limit: CATEGORICAL_ROW_LIMIT }
      : { type: config.chartType }
  ) as ChartWidgetInput["chartConfig"];

  return {
    name: describeScoreChartConfig(config),
    description: "",
    view: VIEW_BY_DATASET[config.dataset],
    dimensions,
    metrics,
    // Matches `buildScoresChartQuery`'s per-dataset data-type scoping so
    // "Add to dashboard" saves the same scope the chart showed.
    filters: scopeFiltersToDataset(filters, config.dataset),
    chartType: config.chartType,
    chartConfig,
  };
}

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

/**
 * Charts only render when the table has a time range; inventing a default
 * range here would make the chart silently omit table rows, so an unfiltered
 * table (`dateRange` undefined) yields no chart range at all.
 */
export function getScoreChartTimeRange(
  dateRange: { from: Date; to?: Date } | undefined,
  now: Date,
): { from: Date; to: Date } | undefined {
  if (!dateRange) return undefined;

  return {
    from: dateRange.from,
    to: dateRange.to ?? now,
  };
}
