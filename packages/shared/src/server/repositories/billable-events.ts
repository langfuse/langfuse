import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType =
  | "observation"
  | "trace"
  | "score"
  | "topic_facet_summary";

export type BillableUnitBucketGranularity = "hour" | "day" | "week" | "month";

const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** UTC bucket start of a DateTime expression; weeks start on Monday. */
const bucketStartSql = (
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
 * Counts the billable units per UTC bucket, project and event type ingested in
 * `[from, to)` of `billable_events.ingested_at`. Every bucket, clipped to
 * `[from, to)`, is one billing window with the rules of
 * `getBillableUnitCountsByProjectInWindow`: a unit counts once in a bucket
 * when it appears there and its id was not ingested in the 24 hours before
 * the bucket starts. Hourly buckets therefore add up to what is metered per
 * hour. A longer bucket can count slightly less, because hourly windows count
 * a unit again once it reappears more than 24 hours after its last row.
 *
 * Memory grows with the number of distinct units in the range, so callers
 * bound the range.
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
      `Billing range must end after it starts, got ${from.toISOString()} to ${to.toISOString()}`,
    );
  }
  if (projectIds.length === 0) return [];

  const bucket = bucketStartSql("seen_at", granularity);

  // Each unit's ingestion times, sorted, cover the range plus the 24 hours
  // before it. A time inside the range is billed when the time before it lies
  // more than 24 hours before its bucket's window starts. Later times in the
  // same window follow a time inside that window, so they are not billed.
  const query = `
    SELECT
      toUnixTimestamp(${bucket}) AS bucket,
      project_id,
      event_type,
      count() AS count
    FROM (
      SELECT
        project_id,
        event_type,
        arraySort(groupArray(ingested_at)) AS ingested
      FROM billable_events
      WHERE project_id IN {projectIds: Array(String)}
      AND ingested_at >= {lookbackFrom: DateTime64(3, 'UTC')}
      AND ingested_at < {to: DateTime64(3, 'UTC')}
      GROUP BY project_id, event_type, event_id
      HAVING max(ingested_at) >= {from: DateTime64(3, 'UTC')}
    )
    ARRAY JOIN ingested AS seen_at, arrayEnumerate(ingested) AS i
    WHERE seen_at >= {from: DateTime64(3, 'UTC')}
    AND (
      i = 1
      OR ingested[i - 1] < greatest(${bucket}, {from: DateTime64(3, 'UTC')}) - INTERVAL 24 HOUR
    )
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
      lookbackFrom: convertDateToClickhouseDateTime(
        new Date(from.getTime() - BILLING_LOOKBACK_MS),
      ),
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
