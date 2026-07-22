import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import {
  type AggregationFn,
  type ChartViewConfig,
  type PrototypeEvent,
  type TimeGranularity,
} from "../types";
import {
  DIMENSION_EXTRACTORS,
  getMetric,
  isTimeSeriesChartType,
  METRIC_EXTRACTORS,
} from "../vocab";

/**
 * The harness's mock data layer: turns raw mock events into `chart-library`
 * `DataPoint[]` for a config, client-side and PURE. It mirrors the shape the
 * production `dashboard.executeQuery` returns for the observations view, so the
 * Storybook stories exercise the exact same view components as the real
 * `EventsChartView` — only the data source differs.
 */
export function aggregateEvents(
  events: PrototypeEvent[],
  config: ChartViewConfig,
): DataPoint[] {
  if (events.length === 0) return [];

  const metric = getMetric(config.metric);
  const extractor = METRIC_EXTRACTORS[config.metric];
  const dimExtractor = DIMENSION_EXTRACTORS[config.breakdown];
  const seriesOf = (e: PrototypeEvent): string =>
    dimExtractor ? dimExtractor(e) : metric.label;

  if (config.chartType === "NUMBER") {
    return [
      {
        time_dimension: undefined,
        dimension: undefined,
        metric: aggregate(events, extractor, config.aggregation),
      },
    ];
  }

  if (isTimeSeriesChartType(config.chartType)) {
    return aggregateTimeSeries(events, config, extractor, seriesOf);
  }

  return aggregateCategorical(events, config, extractor, seriesOf);
}

type Extractor = ((e: PrototypeEvent) => number) | null;

/** Time-series: bucket by time, then per series, in chronological order. */
function aggregateTimeSeries(
  events: PrototypeEvent[],
  config: ChartViewConfig,
  extractor: Extractor,
  seriesOf: (e: PrototypeEvent) => string,
): DataPoint[] {
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
        metric: aggregate(group, extractor, config.aggregation),
      });
    }
  }
  return points;
}

/** Categorical (ranked bars, pie): one aggregate per breakdown value, ranked. */
function aggregateCategorical(
  events: PrototypeEvent[],
  config: ChartViewConfig,
  extractor: Extractor,
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
      metric: aggregate(group, extractor, config.aggregation),
    }))
    .sort((a, b) => (b.metric as number) - (a.metric as number));
}

/** Aggregate one group of events into a single number. */
function aggregate(
  events: PrototypeEvent[],
  extractor: Extractor,
  agg: AggregationFn,
): number {
  if (agg === "count" || extractor === null) {
    return events.length;
  }
  const values = events.map(extractor).filter((v) => Number.isFinite(v));
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
