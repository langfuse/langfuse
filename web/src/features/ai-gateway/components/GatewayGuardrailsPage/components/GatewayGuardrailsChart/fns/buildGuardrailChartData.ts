import type { GatewayTimeSeriesInterval } from "@/src/features/ai-gateway/constants/gatewayTimeSeriesIntervals";
import type {
  ChartProps,
  DataPoint,
} from "@/src/features/widgets/chart-library/chart-props";

const TOTAL_SERIES_KEY = "flagged";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

type RawGuardrailTimeSeriesPoint = {
  timeDimension: string;
  guardrailId?: string;
  count: number;
};

/**
 * Converts ClickHouse guardrail time-series rows into `WidgetChartCard`
 * `DataPoint[]` and series config, filling empty UTC buckets across the
 * selected range so bars stay evenly spaced.
 */
export function buildGuardrailChartData(params: {
  groupByGuardrail: boolean;
  points: readonly RawGuardrailTimeSeriesPoint[];
  timeRange: { from: Date; to: Date };
  interval: GatewayTimeSeriesInterval;
  labels?: ReadonlyMap<string, string>;
}): { data: DataPoint[]; config: NonNullable<ChartProps["config"]> } {
  if (params.points.length === 0) {
    return { data: [], config: {} };
  }

  const buckets = buildUtcBuckets(
    params.timeRange.from,
    params.timeRange.to,
    params.interval,
  );
  const bucketSet = new Set(buckets);

  if (!params.groupByGuardrail) {
    const countsByBucket = new Map<string, number>();
    for (const point of params.points) {
      countsByBucket.set(
        point.timeDimension,
        (countsByBucket.get(point.timeDimension) ?? 0) + point.count,
      );
      bucketSet.add(point.timeDimension);
    }
    const sortedBuckets = [...bucketSet].sort();
    return {
      data: sortedBuckets.map((timeDimension) => ({
        time_dimension: timeDimension,
        dimension: TOTAL_SERIES_KEY,
        metric: countsByBucket.get(timeDimension) ?? 0,
      })),
      config: {
        [TOTAL_SERIES_KEY]: { label: "Flagged requests" },
      },
    };
  }

  const pointsByBucket = new Map<string, RawGuardrailTimeSeriesPoint[]>();
  const seriesIds = new Set<string>();
  for (const point of params.points) {
    if (!point.guardrailId) continue;
    seriesIds.add(point.guardrailId);
    bucketSet.add(point.timeDimension);
    const list = pointsByBucket.get(point.timeDimension) ?? [];
    list.push(point);
    pointsByBucket.set(point.timeDimension, list);
  }

  const sortedBuckets = [...bucketSet].sort();
  const data: DataPoint[] = [];
  for (const timeDimension of sortedBuckets) {
    const bucketPoints = pointsByBucket.get(timeDimension);
    if (!bucketPoints || bucketPoints.length === 0) {
      // Pure bucket marker keeps the time axis continuous without adding a series.
      data.push({
        time_dimension: timeDimension,
        dimension: undefined,
        metric: null,
      });
      continue;
    }
    for (const point of bucketPoints) {
      data.push({
        time_dimension: timeDimension,
        dimension: point.guardrailId,
        metric: point.count,
      });
    }
  }

  const config: NonNullable<ChartProps["config"]> = Object.fromEntries(
    [...seriesIds].map((id) => [id, { label: params.labels?.get(id) ?? id }]),
  );
  return { data, config };
}

/** Matches ClickHouse `toStartOfInterval(t, 1 DAY / 7 DAY)` and `toStartOfMonth(t)` in UTC. */
function buildUtcBuckets(
  from: Date,
  to: Date,
  interval: GatewayTimeSeriesInterval,
): string[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (fromMs > toMs) return [];

  const buckets: string[] = [];
  if (interval === "month") {
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cursor.getTime() <= end.getTime()) {
      buckets.push(formatUtcBucket(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }

  const stepMs = interval === "day" ? DAY_MS : WEEK_MS;
  const startBucket = Math.floor(fromMs / stepMs) * stepMs;
  const endBucket = Math.floor(toMs / stepMs) * stepMs;
  for (let ms = startBucket; ms <= endBucket; ms += stepMs) {
    buckets.push(formatUtcBucket(new Date(ms)));
  }
  return buckets;
}

function formatUtcBucket(date: Date) {
  return date.toISOString().replace(".000Z", "Z");
}
