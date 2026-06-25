import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { type ChartConfig } from "@/src/components/ui/chart";
import {
  type AggregationFn,
  type ChartViewConfig,
  type PrototypeEvent,
  type TimeGranularity,
} from "../types";
import {
  getDimension,
  getMetric,
  isTimeSeriesChartType,
  type MetricDef,
} from "../vocab";

/**
 * Turns raw mock events into `chart-library` `DataPoint[]` for a given config.
 *
 * This is the prototype's whole data layer, and it is deliberately PURE: same
 * events + same config → same output, no React, no fetching. It mirrors the
 * shape the future v4 aggregate endpoint must return (`group-by over the events
 * read path`), so wiring phase 1 is "swap this client function for a tRPC call
 * that produces the same `DataPoint[]`". Per the large-feature playbook, all
 * derivation lives here and the components stay view-only.
 */
export function aggregateEvents(
  events: PrototypeEvent[],
  config: ChartViewConfig,
): DataPoint[] {
  if (events.length === 0) return [];

  const metric = getMetric(config.metric);
  const dimension = getDimension(config.breakdown);
  const seriesOf = (e: PrototypeEvent): string =>
    dimension.valueOf ? dimension.valueOf(e) : metric.label;

  // Big number: one aggregate over everything.
  if (config.chartType === "NUMBER") {
    return [
      {
        time_dimension: undefined,
        dimension: undefined,
        metric: aggregate(events, metric, config.aggregation),
      },
    ];
  }

  if (isTimeSeriesChartType(config.chartType)) {
    return aggregateTimeSeries(events, config, metric, seriesOf);
  }

  return aggregateCategorical(events, config, metric, seriesOf);
}

/** Time-series: bucket by time, then per series, in chronological order. */
function aggregateTimeSeries(
  events: PrototypeEvent[],
  config: ChartViewConfig,
  metric: MetricDef,
  seriesOf: (e: PrototypeEvent) => string,
): DataPoint[] {
  // bucketIso -> seriesKey -> events
  const buckets = new Map<string, Map<string, PrototypeEvent[]>>();
  for (const e of events) {
    const bucket = floorToGranularity(e.startTime, config.timeGranularity);
    const series = seriesOf(e);
    let perSeries = buckets.get(bucket);
    if (!perSeries) {
      perSeries = new Map();
      buckets.set(bucket, perSeries);
    }
    const list = perSeries.get(series);
    if (list) list.push(e);
    else perSeries.set(series, [e]);
  }

  const points: DataPoint[] = [];
  for (const bucket of [...buckets.keys()].sort()) {
    const perSeries = buckets.get(bucket)!;
    for (const [series, group] of perSeries) {
      points.push({
        time_dimension: bucket,
        dimension: series,
        metric: aggregate(group, metric, config.aggregation),
      });
    }
  }
  return points;
}

/** Categorical (ranked bars, pie): one aggregate per breakdown value, ranked. */
function aggregateCategorical(
  events: PrototypeEvent[],
  config: ChartViewConfig,
  metric: MetricDef,
  seriesOf: (e: PrototypeEvent) => string,
): DataPoint[] {
  const groups = new Map<string, PrototypeEvent[]>();
  for (const e of events) {
    const key = seriesOf(e);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      time_dimension: undefined,
      dimension: key,
      metric: aggregate(group, metric, config.aggregation),
    }))
    .sort((a, b) => (b.metric as number) - (a.metric as number));
}

/** Aggregate one group of events into a single number. */
function aggregate(
  events: PrototypeEvent[],
  metric: MetricDef,
  agg: AggregationFn,
): number {
  if (agg === "count" || metric.valueOf === null) {
    return events.length;
  }
  const valueOf = metric.valueOf;
  const values = events
    .map((e) => valueOf(e))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return 0;

  switch (agg) {
    case "sum":
      return values.reduce((acc, v) => acc + v, 0);
    case "avg":
      return values.reduce((acc, v) => acc + v, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "p50":
      return percentile(values, 50);
    case "p95":
      return percentile(values, 95);
    case "p99":
      return percentile(values, 99);
    default:
      return values.length;
  }
}

/** Linear-interpolated percentile over an unsorted numeric array. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const weight = rank - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

/** Floors an ISO timestamp to the start of its minute/hour/day bucket (UTC). */
export function floorToGranularity(
  iso: string,
  granularity: TimeGranularity,
): string {
  const d = new Date(iso);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  if (granularity === "minute") return d.toISOString();
  d.setUTCMinutes(0);
  if (granularity === "hour") return d.toISOString();
  d.setUTCHours(0);
  return d.toISOString();
}

/**
 * Builds the `chart-library` `ChartConfig` (series labels + the `metric` key the
 * bar/pie primitives colour through `--color-metric`) for the rendered series.
 */
export function buildChartConfig(
  data: DataPoint[],
  metricLabel: string,
): ChartConfig {
  const config: ChartConfig = { metric: { label: metricLabel } };
  for (const point of data) {
    if (point.dimension && !config[point.dimension]) {
      config[point.dimension] = { label: point.dimension };
    }
  }
  return config;
}
