import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType =
  | "observation"
  | "trace"
  | "score"
  | "topic_facet_summary";

export type BillableUnitBucketGranularity = "hour" | "day" | "week" | "month";

const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * UTC bucket start of a DateTime column; weeks start on Monday. Code that
 * builds a bucket axis itself must start buckets at the same instants.
 */
export const bucketStartSql = (
  column: string,
  granularity: BillableUnitBucketGranularity,
): string => {
  switch (granularity) {
    case "hour":
      return `toStartOfHour(${column}, 'UTC')`;
    case "day":
      return `toStartOfDay(${column}, 'UTC')`;
    case "week":
      return `toDateTime(toStartOfWeek(${column}, 1, 'UTC'), 'UTC')`;
    case "month":
      return `toDateTime(toStartOfMonth(${column}, 'UTC'), 'UTC')`;
  }
};

/**
 * How long rows stamped with an `ingested_at` before a given moment can take
 * to become readable: the async insert flush that stamps them commits a moment
 * later. Counting a window before its end has settled under-bills it.
 */
export const BILLING_SETTLE_MS = 60 * 1000;

/**
 * Counts the billable units per project and event type ingested in
 * `[windowFrom, windowTo)` of `billable_events.ingested_at`. Each unit counts
 * once per window, and not at all if its id was also ingested in the 24 hours
 * before `windowFrom`. A re-sent or long-running trace is therefore billed once
 * as long as it never goes 24 hours without new data.
 *
 * `billable_events` is never deleted from, so a window that has settled (see
 * `BILLING_SETTLE_MS`) always recomputes to the same counts.
 *
 * The table is created by ClickHouse migration `0057_create_billable_events`
 * and holds only usage ingested after that migration ran.
 */
export const getBillableUnitCountsByProjectInWindow = async ({
  windowFrom,
  windowTo,
  projectId,
}: {
  windowFrom: Date;
  windowTo: Date;
  projectId?: string;
}): Promise<
  Array<{ projectId: string; eventType: BillableEventType; count: number }>
> => {
  if (windowTo.getTime() <= windowFrom.getTime()) {
    throw new Error(
      `Billing window must end after it starts, got ${windowFrom.toISOString()} to ${windowTo.toISOString()}`,
    );
  }

  const projectFilter = projectId ? "AND project_id = {projectId: String}" : "";

  // The NOT IN set only holds lookback ids that also appear in the window, so
  // memory grows with the window, not with the 24-hour lookback.
  const query = `
    WITH window_units AS (
      SELECT project_id, event_type, event_id
      FROM billable_events
      WHERE ingested_at >= {windowFrom: DateTime64(3, 'UTC')}
      AND ingested_at < {windowTo: DateTime64(3, 'UTC')}
      ${projectFilter}
    )
    SELECT
      project_id,
      event_type,
      uniqExact(event_id) AS count
    FROM window_units
    WHERE (project_id, event_type, event_id) NOT IN (
      SELECT project_id, event_type, event_id
      FROM billable_events
      WHERE ingested_at >= {lookbackFrom: DateTime64(3, 'UTC')}
      AND ingested_at < {windowFrom: DateTime64(3, 'UTC')}
      ${projectFilter}
      AND (project_id, event_type, event_id) IN (
        SELECT project_id, event_type, event_id FROM window_units
      )
    )
    GROUP BY project_id, event_type
  `;

  const rows = await queryClickhouse<{
    project_id: string;
    event_type: BillableEventType;
    count: string;
  }>({
    query,
    params: {
      windowFrom: convertDateToClickhouseDateTime(windowFrom),
      windowTo: convertDateToClickhouseDateTime(windowTo),
      lookbackFrom: convertDateToClickhouseDateTime(
        new Date(windowFrom.getTime() - BILLING_LOOKBACK_MS),
      ),
      ...(projectId ? { projectId } : {}),
    },
    clickhouseConfigs: {
      request_timeout: 300000, // 5 minutes timeout
    },
    ...(projectId ? { tags: { projectId } } : {}),
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    eventType: row.event_type,
    count: Number(row.count),
  }));
};

/**
 * Approximate distinct billable units per UTC bucket, project and event type
 * ingested in `[from, to)` of `billable_events.ingested_at`, for usage charts.
 * A unit counts once in every bucket it appears in, so this differs slightly
 * from billing, which bills one window per hour and deduplicates against the
 * 24 hours before it: a unit whose rows span buckets counts in each, and one
 * that reappears more than 24 hours later inside one bucket counts once.
 *
 * `uniqCombined` keeps each group's state at a fixed size, so memory does not
 * grow with the number of units in the range. Its error is about 0.3% on large
 * counts; small counts are exact.
 */
export const getBillableUnitCountsByProjectAndBucket = async ({
  projectIds,
  from,
  to,
  granularity,
}: {
  projectIds: string[];
  from: Date;
  to: Date;
  granularity: BillableUnitBucketGranularity;
}): Promise<
  Array<{
    bucket: Date;
    projectId: string;
    eventType: BillableEventType;
    count: number;
  }>
> => {
  if (to.getTime() <= from.getTime()) {
    throw new Error(
      `Usage range must end after it starts, got ${from.toISOString()} to ${to.toISOString()}`,
    );
  }
  if (projectIds.length === 0) return [];

  const query = `
    SELECT
      toUnixTimestamp(${bucketStartSql("ingested_at", granularity)}) AS bucket,
      project_id,
      event_type,
      uniqCombined(event_id) AS count
    FROM billable_events
    WHERE project_id IN {projectIds: Array(String)}
    AND ingested_at >= {from: DateTime64(3, 'UTC')}
    AND ingested_at < {to: DateTime64(3, 'UTC')}
    GROUP BY bucket, project_id, event_type
  `;

  const rows = await queryClickhouse<{
    bucket: string | number;
    project_id: string;
    event_type: BillableEventType;
    count: string;
  }>({
    query,
    params: {
      projectIds,
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(to),
    },
    clickhouseConfigs: {
      request_timeout: 120_000,
    },
  });

  return rows.map((row) => ({
    bucket: new Date(Number(row.bucket) * 1000),
    projectId: row.project_id,
    eventType: row.event_type,
    count: Number(row.count),
  }));
};

/**
 * Approximate distinct billable units per project and event type ingested in
 * `[from, to)` of `billable_events.ingested_at`, across every project. The
 * free-tier threshold job reads one UTC day at a time and adds the days up, so
 * a unit counts once in every day it appears in, as it does in the Usage tab
 * at day granularity (`getBillableUnitCountsByProjectAndBucket`). Counts use
 * the same `uniqCombined` estimate, which is exact for small counts.
 */
export const getBillableUnitCountsForAllProjectsInRange = async ({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): Promise<
  Array<{ projectId: string; eventType: BillableEventType; count: number }>
> => {
  if (to.getTime() <= from.getTime()) {
    throw new Error(
      `Usage range must end after it starts, got ${from.toISOString()} to ${to.toISOString()}`,
    );
  }

  const rows = await queryClickhouse<{
    project_id: string;
    event_type: BillableEventType;
    count: string;
  }>({
    query: `
      SELECT
        project_id,
        event_type,
        uniqCombined(event_id) AS count
      FROM billable_events
      WHERE ingested_at >= {from: DateTime64(3, 'UTC')}
      AND ingested_at < {to: DateTime64(3, 'UTC')}
      GROUP BY project_id, event_type
    `,
    params: {
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(to),
    },
    clickhouseConfigs: {
      request_timeout: 120_000,
    },
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    eventType: row.event_type,
    count: Number(row.count),
  }));
};

/**
 * When the ledger got its first row, or null while it is empty. Usage before
 * that was never recorded, because the ledger is not backfilled. `min` and
 * `count` of the partition key column are answered from part metadata.
 */
export const getBillableEventsLedgerStart = async (): Promise<Date | null> => {
  const [row] = await queryClickhouse<{ start: number; rows: string }>({
    query: `
      SELECT toUnixTimestamp(min(ingested_at)) AS start, count() AS rows
      FROM billable_events
    `,
  });
  return row && Number(row.rows) > 0 ? new Date(row.start * 1000) : null;
};
