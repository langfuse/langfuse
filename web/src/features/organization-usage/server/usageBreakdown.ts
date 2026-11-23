import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  CORRECTION_SCORES_BILLABLE_FROM,
  LISTABLE_SCORE_TYPES,
} from "@langfuse/shared";
import {
  type BillableEventType,
  type BillableUnitBucketGranularity,
  bucketStartSql,
  convertDateToClickhouseDateTime,
  getBillableEventsLedgerStart,
  getBillableUnitCountsByProjectAndBucket,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

type BillableUnitType =
  | "traces"
  | "observations"
  | "scores"
  | "topicFacetSummaries";

type UsageBreakdownGranularity = BillableUnitBucketGranularity;

type V4WriteMode = typeof env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

type UsageBreakdownRow = {
  bucket: string;
  projectId: string;
  unitType: BillableUnitType;
  count: number;
};

const UNIT_TYPE_BY_EVENT_TYPE: Record<BillableEventType, BillableUnitType> = {
  trace: "traces",
  observation: "observations",
  score: "scores",
  topic_facet_summary: "topicFacetSummaries",
};

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

/** Must start buckets where `bucketStartSql` does. */
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
 * Billable units per bucket, project and unit type from the legacy traces,
 * observations and scores tables, the only ones a `legacy` deployment writes:
 * rows counted by `created_at` in a half-open window, no FINAL. Scores include
 * the listable data types, plus CORRECTION rows created at or after the
 * billing cutoff.
 */
const getLegacyBillableUnitsByBucket = async ({
  projectIds,
  from,
  to,
  granularity,
}: {
  projectIds: string[];
  from: Date;
  to: Date;
  granularity: UsageBreakdownGranularity;
}): Promise<UsageBreakdownRow[]> => {
  const bucket = `toUnixTimestamp(${bucketStartSql("created_at", granularity)})`;
  const where = `
    project_id IN {projectIds: Array(String)}
    AND created_at >= {from: DateTime64(3)}
    AND created_at < {to: DateTime64(3)}`;

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
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(to),
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
 * Billable units per bucket, project and unit type from the billable_events
 * ledger, which billing reads once the deployment writes the events tables:
 * approximate distinct units per bucket, close to but not exactly what is
 * billed.
 */
const getLedgerBillableUnitsByBucket = async (
  params: Parameters<typeof getBillableUnitCountsByProjectAndBucket>[0],
): Promise<UsageBreakdownRow[]> =>
  (await getBillableUnitCountsByProjectAndBucket(params)).map((row) => ({
    bucket: row.bucket.toISOString(),
    projectId: row.projectId,
    unitType: UNIT_TYPE_BY_EVENT_TYPE[row.eventType],
    count: row.count,
  }));

/**
 * Billable units of an organization's live projects over [from, to), bucketed
 * by the given UTC granularity, or one chosen from the range's length. A `to`
 * in the future is cut off at now. Soft-deleted projects are left out, as
 * they are when usage is metered.
 *
 * The source follows the v4 write mode: `legacy` deployments count the legacy
 * tables, and `dual` and `events_only` deployments read the billable_events
 * ledger, fed from the events tables. The ledger is not backfilled, so
 * `usageRecordedFrom` is when it got its first row (null when it is empty);
 * buckets before it show no usage. It is null for the legacy tables.
 */
export const getOrgUsageBreakdown = async ({
  prisma,
  orgId,
  from,
  to,
  granularity: requestedGranularity,
  writeMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
}: {
  prisma: PrismaClient;
  orgId: string;
  from: Date;
  to: Date;
  granularity?: UsageBreakdownGranularity;
  writeMode?: V4WriteMode;
}) => {
  const end = new Date(Math.min(to.getTime(), Date.now()));
  const granularity =
    requestedGranularity ?? getUsageBreakdownGranularity(from, end);
  const buckets = getBucketStarts(from, end, granularity).map((bucket) =>
    bucket.toISOString(),
  );
  const readsLedger = writeMode !== "legacy";

  const projects = await prisma.project.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const query = {
    projectIds: projects.map((project) => project.id),
    from,
    to: end,
    granularity,
  };
  const readRows = async (): Promise<UsageBreakdownRow[]> => {
    if (projects.length === 0 || from >= end) return [];
    return readsLedger
      ? getLedgerBillableUnitsByBucket(query)
      : getLegacyBillableUnitsByBucket(query);
  };
  const [rows, ledgerStart] = await Promise.all([
    readRows(),
    readsLedger ? getBillableEventsLedgerStart() : null,
  ]);

  return {
    granularity,
    buckets,
    projects,
    rows,
    usageRecordedFrom: ledgerStart?.toISOString() ?? null,
  };
};
