import { Prisma } from "@langfuse/shared/src/db";

export type ResolvedTimelineGranularity =
  | "minute"
  | "2m"
  | "5m"
  | "hour"
  | "day";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
export const MAX_TIMELINE_RANGE_MS = 30 * DAY_MS;
const TIMELINE_GRANULARITY_DURATION_TOLERANCE_MS = 1000;

const timelineGranularityRules: ReadonlyArray<{
  maxDurationMs: number;
  granularity: ResolvedTimelineGranularity;
}> = [
  { maxDurationMs: 30 * MINUTE_MS, granularity: "minute" },
  { maxDurationMs: HOUR_MS, granularity: "2m" },
  { maxDurationMs: 3 * HOUR_MS, granularity: "5m" },
  { maxDurationMs: 7 * DAY_MS, granularity: "hour" },
  { maxDurationMs: MAX_TIMELINE_RANGE_MS, granularity: "day" },
];

export const resolveTimelineGranularity = (
  fromTimestamp: Date,
  toTimestamp: Date,
): ResolvedTimelineGranularity => {
  const diffMs = toTimestamp.getTime() - fromTimestamp.getTime();

  return (
    timelineGranularityRules.find(
      (rule) =>
        diffMs <=
        rule.maxDurationMs + TIMELINE_GRANULARITY_DURATION_TOLERANCE_MS,
    )?.granularity ?? "day"
  );
};

export const getTimelineBucketSql = (
  sql: string,
  granularity: ResolvedTimelineGranularity,
): string => {
  const intervalByGranularity: Record<ResolvedTimelineGranularity, string> = {
    minute: "1 MINUTE",
    "2m": "2 MINUTE",
    "5m": "5 MINUTE",
    hour: "1 HOUR",
    day: "1 DAY",
  };

  return `toStartOfInterval(${sql}, INTERVAL ${intervalByGranularity[granularity]}, 'UTC')`;
};

export const getPostgresTimelineBucketExpression = (
  sql: Prisma.Sql,
  granularity: ResolvedTimelineGranularity,
): Prisma.Sql => {
  const intervalByGranularity: Record<ResolvedTimelineGranularity, string> = {
    minute: "1 minute",
    "2m": "2 minutes",
    "5m": "5 minutes",
    hour: "1 hour",
    day: "1 day",
  };

  return Prisma.sql`date_bin(${intervalByGranularity[granularity]}::interval, ${sql}, '1970-01-01T00:00:00Z'::timestamptz)`;
};

export const floorTimelineBucket = (
  timestamp: Date,
  granularity: ResolvedTimelineGranularity,
): Date => {
  const bucket = new Date(timestamp);

  switch (granularity) {
    case "minute":
      bucket.setUTCSeconds(0, 0);
      return bucket;
    case "2m":
      bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 2) * 2, 0, 0);
      return bucket;
    case "5m":
      bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5, 0, 0);
      return bucket;
    case "hour":
      bucket.setUTCMinutes(0, 0, 0);
      return bucket;
    case "day":
      bucket.setUTCHours(0, 0, 0, 0);
      return bucket;
    default: {
      const exhaustiveCheck: never = granularity;
      throw new Error(`Invalid timeline granularity: ${exhaustiveCheck}`);
    }
  }
};

export const addTimelineBucket = (
  timestamp: Date,
  granularity: ResolvedTimelineGranularity,
): Date => {
  const next = new Date(timestamp);

  switch (granularity) {
    case "minute":
      next.setUTCMinutes(next.getUTCMinutes() + 1);
      return next;
    case "2m":
      next.setUTCMinutes(next.getUTCMinutes() + 2);
      return next;
    case "5m":
      next.setUTCMinutes(next.getUTCMinutes() + 5);
      return next;
    case "hour":
      next.setUTCHours(next.getUTCHours() + 1);
      return next;
    case "day":
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    default: {
      const exhaustiveCheck: never = granularity;
      throw new Error(`Invalid timeline granularity: ${exhaustiveCheck}`);
    }
  }
};

export const formatTimelineBucket = (timestamp: Date): string =>
  timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
