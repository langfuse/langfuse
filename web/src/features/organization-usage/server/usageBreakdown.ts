import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  CORRECTION_SCORES_BILLABLE_FROM,
  LISTABLE_SCORE_TYPES,
} from "@langfuse/shared";
import { env } from "@langfuse/shared/src/env";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
} from "@langfuse/shared/src/server";

type BillableUnitType =
  | "traces"
  | "observations"
  | "scores"
  | "facet_summaries";

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
const BUCKET_SQL: Record<
  UsageBreakdownGranularity,
  (column: string) => string
> = {
  hour: (column) => `toStartOfHour(${column}, 'UTC')`,
  day: (column) => `toStartOfDay(${column}, 'UTC')`,
  week: (column) => `toDateTime(toStartOfWeek(${column}, 1, 'UTC'), 'UTC')`,
  month: (column) => `toDateTime(toStartOfMonth(${column}, 'UTC'), 'UTC')`,
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
 * `created_at` in a half-open window, no FINAL. Scores include the listable
 * data types, plus CORRECTION rows created at or after the billing cutoff.
 * Topics facet summaries are read from the billable_events ledger by
 * `ingested_at`. They count once per bucket, without the ledger's 24-hour
 * lookback, so a bucket can show a re-summary that was not billed again.
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
  const bucket = `toUnixTimestamp(${BUCKET_SQL[granularity]("created_at")})`;
  const facetSummaryBucket = `toUnixTimestamp(${BUCKET_SQL[granularity]("ingested_at")})`;
  const facetSummaries =
    env.LANGFUSE_BILLING_FACET_SUMMARIES_ENABLED === "true"
      ? `
    UNION ALL
    SELECT ${facetSummaryBucket} AS bucket, project_id, 'facet_summaries' AS unit_type, uniqExact(event_id) AS count
    FROM billable_events
    WHERE project_id IN {projectIds: Array(String)}
    AND event_type = 'facet_summary'
    AND ingested_at >= {start: DateTime64(3)}
    AND ingested_at < {end: DateTime64(3)}
    GROUP BY bucket, project_id`
      : "";
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
    AND (
      data_type IN ({dataTypes: Array(String)})
      OR (
        data_type = 'CORRECTION'
        AND created_at >= {correctionsFrom: DateTime64(3)}
      )
    )
    GROUP BY bucket, project_id
    ${facetSummaries}
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
      correctionsFrom: convertDateToClickhouseDateTime(
        CORRECTION_SCORES_BILLABLE_FROM,
      ),
    },
    clickhouseConfigs: { request_timeout: 120_000 },
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
