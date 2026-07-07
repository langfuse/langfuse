import { type z } from "zod";
import { type granularities } from "./types";

export type TimeGranularity = z.infer<typeof granularities>;

export function determineTimeGranularity(
  fromTimestamp: string,
  toTimestamp: string,
): TimeGranularity {
  const from = new Date(fromTimestamp);
  const to = new Date(toTimestamp);
  const diffMs = to.getTime() - from.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 2) {
    return "minute";
  }
  if (diffHours < 72) {
    return "hour";
  }
  if (diffHours < 1440) {
    return "day";
  }
  if (diffHours < 8760) {
    return "week";
  }

  return "month";
}

const addUtcMonths = (date: Date, months: number): Date =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );

export function getNextTimeBucketStart(
  bucketStart: Date,
  granularity: TimeGranularity,
): Date {
  const startMs = bucketStart.getTime();

  switch (granularity) {
    case "minute":
      return new Date(startMs + 60 * 1000);
    case "hour":
    case "1h":
      return new Date(startMs + 60 * 60 * 1000);
    case "day":
    case "1d":
      return new Date(startMs + 24 * 60 * 60 * 1000);
    case "week":
    case "1w":
      return new Date(startMs + 7 * 24 * 60 * 60 * 1000);
    case "month":
      return addUtcMonths(bucketStart, 1);
    case "5m":
      return new Date(startMs + 5 * 60 * 1000);
    case "10m":
      return new Date(startMs + 10 * 60 * 1000);
    case "15m":
      return new Date(startMs + 15 * 60 * 1000);
    case "30m":
      return new Date(startMs + 30 * 60 * 1000);
    case "2h":
      return new Date(startMs + 2 * 60 * 60 * 1000);
    case "4h":
      return new Date(startMs + 4 * 60 * 60 * 1000);
    case "2d":
      return new Date(startMs + 2 * 24 * 60 * 60 * 1000);
    case "auto":
      throw new Error("Granularity 'auto' must be resolved before bucketing");
    default: {
      const exhaustiveCheck: never = granularity;
      return exhaustiveCheck;
    }
  }
}

export function getTimeBucketRange(params: {
  bucketStart: Date;
  granularity: TimeGranularity;
  queryFrom: Date;
  queryTo: Date;
}): { from: Date; to: Date } {
  const nextBucketStart = getNextTimeBucketStart(
    params.bucketStart,
    params.granularity,
  );
  const bucketEnd = new Date(nextBucketStart.getTime() - 1);

  return {
    from:
      params.bucketStart.getTime() < params.queryFrom.getTime()
        ? params.queryFrom
        : params.bucketStart,
    to:
      bucketEnd.getTime() > params.queryTo.getTime()
        ? params.queryTo
        : bucketEnd,
  };
}
