import { type PrismaClient } from "@langfuse/shared/src/db";
import { LISTABLE_SCORE_TYPES } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
} from "@langfuse/shared/src/server";

type BillableUnitType = "traces" | "observations" | "scores";

type UsageBreakdownGranularity = "hour" | "day" | "week" | "month";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Picks calendar-aligned bars for the requested window: hourly up to two days,
 * daily up to two months, weekly up to half a year, monthly beyond.
 */
const getUsageBreakdownGranularity = (
  from: Date,
  to: Date,
): UsageBreakdownGranularity => {
  const spanMs = to.getTime() - from.getTime();
  if (spanMs <= 2 * DAY_MS) return "hour";
  if (spanMs <= 62 * DAY_MS) return "day";
  if (spanMs <= 183 * DAY_MS) return "week";
  return "month";
};

/** UTC bucket expression; weeks start on Monday. Must match `startOfBucket`. */
const BUCKET_SQL: Record<UsageBreakdownGranularity, string> = {
  hour: "toStartOfHour(created_at, 'UTC')",
  day: "toStartOfDay(created_at, 'UTC')",
  week: "toDateTime(toStartOfWeek(created_at, 1, 'UTC'), 'UTC')",
  month: "toDateTime(toStartOfMonth(created_at, 'UTC'), 'UTC')",
};

const startOfBucket = (
  date: Date,
  granularity: UsageBreakdownGranularity,
): Date => {
  const d = new Date(date);
  switch (granularity) {
    case "hour":
      d.setUTCMinutes(0, 0, 0);
      return d;
    case "day":
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case "week":
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d;
    case "month":
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      return d;
  }
};

const nextBucket = (
  bucket: Date,
  granularity: UsageBreakdownGranularity,
): Date => {
  const d = new Date(bucket);
  switch (granularity) {
    case "hour":
      d.setUTCHours(d.getUTCHours() + 1);
      return d;
    case "day":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "week":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
  }
};

/** Every bucket start overlapping [from, to), so empty periods still get a bar. */
const getBucketStarts = (
  from: Date,
  to: Date,
  granularity: UsageBreakdownGranularity,
): Date[] => {
  const buckets: Date[] = [];
  for (
    let bucket = startOfBucket(from, granularity);
    bucket < to;
    bucket = nextBucket(bucket, granularity)
  ) {
    buckets.push(bucket);
  }
  return buckets;
};

/**
 * Billable units per bucket, project and unit type. Mirrors the metering
 * definition used for Stripe and ClickHouse Billing: rows counted by
 * `created_at` in a half-open window, scores limited to listable data types,
 * no FINAL.
 */
const getBillableUnitsByBucket = async ({
  projectIds,
  start,
  end,
  granularity,
}: {
  projectIds: string[];
  start: Date;
  end: Date;
  granularity: UsageBreakdownGranularity;
}) => {
  const bucket = `toUnixTimestamp(${BUCKET_SQL[granularity]})`;
  const where = `
    project_id IN {projectIds: Array(String)}
    AND created_at >= {start: DateTime64(3)}
    AND created_at < {end: DateTime64(3)}`;

  const query = `
    SELECT ${bucket} AS bucket, project_id, 'traces' AS unit_type, count() AS count
    FROM traces
    WHERE ${where}
    GROUP BY bucket, project_id
    UNION ALL
    SELECT ${bucket} AS bucket, project_id, 'observations' AS unit_type, count() AS count
    FROM observations
    WHERE ${where}
    GROUP BY bucket, project_id
    UNION ALL
    SELECT ${bucket} AS bucket, project_id, 'scores' AS unit_type, count() AS count
    FROM scores
    WHERE ${where}
    AND data_type IN ({dataTypes: Array(String)})
    GROUP BY bucket, project_id
  `;

  const rows = await queryClickhouse<{
    bucket: string | number;
    project_id: string;
    unit_type: BillableUnitType;
    count: string | number;
  }>({
    query,
    params: {
      projectIds,
      start: convertDateToClickhouseDateTime(start),
      end: convertDateToClickhouseDateTime(end),
      dataTypes: LISTABLE_SCORE_TYPES,
    },
    clickhouseConfigs: { request_timeout: 120_000 },
    preferredClickhouseService: "ReadOnly",
  });

  return rows.map((row) => ({
    bucket: new Date(Number(row.bucket) * 1000).toISOString(),
    projectId: row.project_id,
    unitType: row.unit_type,
    count: Number(row.count),
  }));
};

/**
 * Billable units of an organization's live projects over [from, to), bucketed
 * by an automatically chosen UTC granularity. Soft-deleted projects are left
 * out, as they are when usage is metered.
 */
export const getOrgUsageBreakdown = async ({
  prisma,
  orgId,
  from,
  to,
}: {
  prisma: PrismaClient;
  orgId: string;
  from: Date;
  to: Date;
}) => {
  const end = new Date(Math.min(to.getTime(), Date.now()));
  const granularity = getUsageBreakdownGranularity(from, end);
  const buckets = getBucketStarts(from, end, granularity).map((bucket) =>
    bucket.toISOString(),
  );

  const projects = await prisma.project.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows =
    projects.length > 0 && from < end
      ? await getBillableUnitsByBucket({
          projectIds: projects.map((project) => project.id),
          start: from,
          end,
          granularity,
        })
      : [];

  return { granularity, buckets, projects, rows };
};
