import { type FilterState, type QueryType } from "@langfuse/shared";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { getWidgetMissingBucketValue } from "@/src/features/widgets/utils";
import { type ChartViewConfig } from "../types";
import { getDimension, getMetric, isTimeSeriesChartType } from "../vocab";

/** Ranked/pie charts show a top-N slice. */
const CATEGORICAL_ROW_LIMIT = 20;

const VIEW = "observations" as const;

// Which sidebar/search filters the chart can honour (and the reasons it can't)
// live in `chartFilterCompatibility`. Callers narrow the FilterState with its
// `toChartFilters` before handing it here.

/** The executeQuery column name for a metric, e.g. `p95_latency`, `count_count`. */
export const metricField = (config: ChartViewConfig): string =>
  `${config.aggregation}_${getMetric(config.metric).measure}`;

/**
 * Builds the dashboard `QueryType` for a chart-view config over the v4
 * observations read path. Mirrors `WidgetForm`'s query construction: a time
 * series carries an auto-granularity `timeDimension`; a categorical chart drops
 * the time dimension and sorts top-N descending; a big number ignores the
 * breakdown entirely. `filters` and the time window come straight from the
 * events table so the chart always reflects what the table is showing.
 */
export function buildChartQuery({
  config,
  filters,
  fromTimestamp,
  toTimestamp,
}: {
  config: ChartViewConfig;
  filters: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
}): QueryType {
  const metric = getMetric(config.metric);
  const dimension = getDimension(config.breakdown);
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const isNumber = config.chartType === "NUMBER";

  // A big number is a single global aggregate — no breakdown, no time bucket.
  const dimensions =
    !isNumber && dimension.field ? [{ field: dimension.field }] : [];

  // Categorical breakdown (ranked bar / pie) → top-N descending by the metric.
  const isCategoricalBreakdown =
    !isTimeSeries && !isNumber && dimensions.length > 0;
  const field = metricField(config);

  return {
    view: VIEW,
    dimensions,
    metrics: [{ measure: metric.measure, aggregation: config.aggregation }],
    filters,
    // Auto-granularity, exactly like dashboard widgets (which have no
    // granularity control) — so a chart added to a dashboard renders the same
    // buckets there as here. See `chartConfigToWidgetInput`.
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
const dimensionValue = (raw: unknown): string => {
  if (raw === null || raw === undefined || raw === "") return "n/a";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(", ");
  return String(raw);
};

/**
 * Turns `executeQuery` rows into chart-library `DataPoint[]` for a config —
 * the inverse of {@link buildChartQuery}. Pure; unit-tested. Time-series rows
 * carry `time_dimension`; a no-breakdown series is labelled by the metric so
 * the chart shows a single named line.
 */
export function rowsToDataPoints(
  rows: Array<Record<string, unknown>>,
  config: ChartViewConfig,
): DataPoint[] {
  const metric = getMetric(config.metric);
  const dimension = getDimension(config.breakdown);
  const field = metricField(config);
  const isNumber = config.chartType === "NUMBER";
  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const hasBreakdown = !isNumber && dimension.field !== null;

  return rows.map((row) => {
    const time_dimension = row["time_dimension"] as string | undefined;
    const value = row[field];

    // A gap-filled empty bucket on a BREAKDOWN time series arrives with no
    // dimension and a filler metric (null, or 0 for additive aggs). Keep it as a
    // pure bucket marker holding the axis slot — NOT a spurious "n/a" series.
    // Mirrors DashboardWidget's prep so the same rows render identically here and
    // on a dashboard (LFE-10694).
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
    // Preserve an explicit null on a time series as a GAP — never coerce it to
    // 0 (the DataPoint contract, chart-props.ts: "null means measured nothing").
    // Categorical/number charts still floor a missing value.
    const metricValue = Array.isArray(value)
      ? value
      : isTimeSeries && value == null
        ? null
        : Number(value ?? 0);
    return { time_dimension, dimension: dim, metric: metricValue };
  });
}
