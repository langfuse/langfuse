import { FilterState } from "../../types";
import {
  getScoreAggregateGreptime,
  getObservationCostByTypeByTimeGreptime,
  getObservationUsageByTypeByTimeGreptime,
} from "./greptime/dashboards";

/**
 * Dashboard rollup reads (04-read-path.md, P2). The three analytic reads now delegate to the
 * GreptimeDB read path (`repositories/greptime/dashboards.ts`). The time-bucket helpers below stay
 * dialect-agnostic and are reused: `orderByTimeSeries` is the bucket-size oracle (its ClickHouse
 * `WITH FILL` string is unused by the GreptimeDB path, which gap-fills app-side) and is still
 * exercised by the dashboard router + unit tests.
 */

export type DateTrunc = "month" | "week" | "day" | "hour" | "minute";

export const getScoreAggregate = async (
  projectId: string,
  filter: FilterState,
) => {
  return getScoreAggregateGreptime(projectId, filter);
};

export const getObservationCostByTypeByTime = async (
  projectId: string,
  filter: FilterState,
) => {
  const [, { fromTime, toTime }, bucketSizeSeconds] = orderByTimeSeries(
    filter,
    "start_time",
  );
  return getObservationCostByTypeByTimeGreptime({
    projectId,
    filter,
    fromTime,
    toTime,
    bucketSizeSeconds,
  });
};

export const getObservationUsageByTypeByTime = async (
  projectId: string,
  filter: FilterState,
) => {
  const [, { fromTime, toTime }, bucketSizeSeconds] = orderByTimeSeries(
    filter,
    "start_time",
  );
  return getObservationUsageByTypeByTimeGreptime({
    projectId,
    filter,
    fromTime,
    toTime,
    bucketSizeSeconds,
  });
};

export const orderByTimeSeries = (
  filter: FilterState,
  col: string,
): [string, { fromTime: number; toTime: number }, number] => {
  const potentialBucketSizesSeconds = [
    5, 10, 30, 60, 300, 600, 1800, 3600, 18000, 36000, 86400, 604800, 2592000,
  ];

  // Calculate time difference in seconds
  const [from, to] = extractFromAndToTimestampsFromFilter(filter);

  if (!from || !to) {
    throw new Error("Time Filter is required for time series queries");
  }

  const fromDate = new Date(from.value as Date);
  const toDate = new Date(to.value as Date);

  const diffInSeconds = Math.abs(toDate.getTime() - fromDate.getTime()) / 1000;

  // choose the bucket size that is the closest to the desired number of buckets
  const bucketSizeInSeconds = potentialBucketSizesSeconds.reduce(
    (closest, size) => {
      const diffFromDesiredBuckets = Math.abs(diffInSeconds / size - 50);
      return diffFromDesiredBuckets < closest.diffFromDesiredBuckets
        ? { size, diffFromDesiredBuckets }
        : closest;
    },
    { size: 0, diffFromDesiredBuckets: Infinity },
  ).size;

  // Convert to interval string
  const interval = `toIntervalSecond(${bucketSizeInSeconds})`;

  return [
    `ORDER BY ${col} ASC
    WITH FILL
    FROM toStartOfInterval(toDateTime({fromTime: DateTime64(3)}), INTERVAL ${bucketSizeInSeconds} SECOND)
    TO toDateTime({toTime: DateTime64(3)}) + INTERVAL ${bucketSizeInSeconds} SECOND
    STEP ${interval}`,
    { fromTime: fromDate.getTime(), toTime: toDate.getTime() },
    bucketSizeInSeconds,
  ];
};

export const selectTimeseriesColumn = (
  bucketSizeInSeconds: number,
  col: string,
  as: String,
) => {
  return `toStartOfInterval(${col}, INTERVAL ${bucketSizeInSeconds} SECOND) as ${as}`;
};

export const extractFromAndToTimestampsFromFilter = (filter?: FilterState) => {
  if (!filter)
    throw new Error("Time Filter is required for time series queries");

  const fromTimestamp = filter.filter(
    (f) => f.type === "datetime" && (f.operator === ">" || f.operator === ">="),
  );

  const toTimestamp = filter.filter(
    (f) => f.type === "datetime" && (f.operator === "<" || f.operator === "<="),
  );

  return [fromTimestamp[0], toTimestamp[0]];
};
