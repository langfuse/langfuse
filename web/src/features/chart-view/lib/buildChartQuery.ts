import { type FilterState, type QueryType } from "@langfuse/shared";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { type ChartViewConfig } from "../types";
import { getDimension, getMetric, isTimeSeriesChartType } from "../vocab";

/** Ranked/pie charts show a top-N slice. */
const CATEGORICAL_ROW_LIMIT = 20;

const VIEW = "observations" as const;

/**
 * Events-table filter columns that map 1:1 onto observations-view dimensions and
 * are safe to forward to the aggregate query. Exotic filters (scores, metadata,
 * isRootObservation, time) are dropped here rather than risk an invalid query —
 * the happy-path scope ("punt gnarly FilterState"). The time window is passed
 * separately as from/to, so any time filter is intentionally excluded.
 */
const SAFE_FILTER_COLUMNS = new Set([
  "environment",
  "type",
  "name",
  "level",
  "providedModelName",
]);

/**
 * Narrows the events table's `FilterState` to the subset that maps cleanly onto
 * the observations query, so the chart reflects the table's filters without
 * choking on columns the query view doesn't model.
 */
export function toChartFilters(filterState: FilterState): FilterState {
  return filterState.filter((f) => SAFE_FILTER_COLUMNS.has(f.column));
}

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
    timeDimension: isTimeSeries
      ? { granularity: config.timeGranularity }
      : null,
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
  const hasBreakdown = !isNumber && dimension.field !== null;

  return rows.map((row) => {
    const time_dimension = row["time_dimension"] as string | undefined;
    const dim = hasBreakdown
      ? dimensionValue(row[dimension.field as string])
      : isNumber
        ? undefined
        : metric.label;
    const value = row[field];
    return {
      time_dimension,
      dimension: dim,
      metric: Array.isArray(value) ? value : Number(value ?? 0),
    };
  });
}
