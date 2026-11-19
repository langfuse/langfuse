import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType =
  | "observation"
  | "trace"
  | "score"
  | "topic_facet_summary";

const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BILLING_WINDOW_MS = 15 * 60 * 1000;

/**
 * How long rows stamped with an `ingested_at` before a given moment can take
 * to become readable: the async insert flush that stamps them commits a moment
 * later. Counting a range before its end has settled under-bills it.
 */
export const BILLING_SETTLE_MS = 60 * 1000;

/**
 * Counts the billable units per project and event type ingested in
 * `[from, to)` of `billable_events.ingested_at`.
 *
 * A unit is billed at its first appearance in a 15-minute window (:00, :15,
 * :30, :45) when its id did not appear in the 24 hours before that window
 * starts. Whether an appearance is billed does not depend on the requested
 * range, so any split of a range adds up to the range: ClickHouse Billing's
 * polls, Stripe's hours and longer usage ranges agree. A re-sent or
 * long-running unit is billed once as long as it never goes 24 hours (up to
 * 24 hours 15 minutes, depending on where in its window it reappears) without
 * new data.
 *
 * `billable_events` is never deleted from, so a range that has settled (see
 * `BILLING_SETTLE_MS`) always recomputes to the same counts. The table is
 * created by ClickHouse migration `0057_create_billable_events` and holds only
 * usage ingested after that migration ran.
 */
export const getBillableUnitCountsByProjectInRange = async ({
  from,
  to,
  projectId,
}: {
  from: Date;
  to: Date;
  projectId?: string;
}): Promise<
  Array<{ projectId: string; eventType: BillableEventType; count: number }>
> => {
  if (to.getTime() <= from.getTime()) {
    throw new Error(
      `Billing range must end after it starts, got ${from.toISOString()} to ${to.toISOString()}`,
    );
  }

  // Reading from the start of `from`'s window tells whether a unit's first
  // appearance in that window falls before `from`, and so was billed in an
  // earlier range.
  const windowFrom = new Date(
    Math.floor(from.getTime() / BILLING_WINDOW_MS) * BILLING_WINDOW_MS,
  );
  const projectFilter = projectId ? "AND project_id = {projectId: String}" : "";

  // Per unit, `windows` holds its windows sorted by start, each with the
  // unit's first appearance there, and `last_lookback_window` its latest
  // window in the 24 hours before `windowFrom` (0 when there is none). A
  // window bills its first appearance when the unit's previous window started
  // more than 24 hours earlier. The lookback only reads ids that also appear in
  // the range, so memory grows with the range, not with the lookback.
  const query = `
    WITH unit_windows AS (
      SELECT
        project_id,
        event_type,
        event_id,
        toUInt32(toStartOfFifteenMinutes(ingested_at)) AS window_start,
        min(ingested_at) AS first_ingested_at
      FROM billable_events
      WHERE ingested_at >= {windowFrom: DateTime64(3, 'UTC')}
      AND ingested_at < {to: DateTime64(3, 'UTC')}
      ${projectFilter}
      GROUP BY project_id, event_type, event_id, window_start
    ),
    range_units AS (
      SELECT
        project_id,
        event_type,
        event_id,
        arraySort(groupArray((window_start, first_ingested_at))) AS windows
      FROM unit_windows
      GROUP BY project_id, event_type, event_id
    ),
    lookback_units AS (
      SELECT
        project_id,
        event_type,
        event_id,
        max(toUInt32(toStartOfFifteenMinutes(ingested_at))) AS last_lookback_window
      FROM billable_events
      WHERE ingested_at >= {lookbackFrom: DateTime64(3, 'UTC')}
      AND ingested_at < {windowFrom: DateTime64(3, 'UTC')}
      ${projectFilter}
      AND (project_id, event_type, event_id) IN (
        SELECT project_id, event_type, event_id FROM range_units
      )
      GROUP BY project_id, event_type, event_id
    )
    SELECT
      r.project_id AS project_id,
      r.event_type AS event_type,
      sum(
        arrayCount(
          (windowStart, previousStart, firstIngestedAt) ->
            windowStart - previousStart > {lookbackSeconds: UInt32}
            AND firstIngestedAt >= {from: DateTime64(3, 'UTC')},
          arrayMap(w -> w.1, r.windows),
          arrayPushFront(
            arrayPopBack(arrayMap(w -> w.1, r.windows)),
            l.last_lookback_window
          ),
          arrayMap(w -> w.2, r.windows)
        )
      ) AS count
    FROM range_units AS r
    LEFT JOIN lookback_units AS l
      ON r.project_id = l.project_id
      AND r.event_type = l.event_type
      AND r.event_id = l.event_id
    GROUP BY r.project_id, r.event_type
    HAVING count > 0
    SETTINGS join_use_nulls = 0
  `;

  const rows = await queryClickhouse<{
    project_id: string;
    event_type: BillableEventType;
    count: string;
  }>({
    query,
    params: {
      from: convertDateToClickhouseDateTime(from),
      to: convertDateToClickhouseDateTime(to),
      windowFrom: convertDateToClickhouseDateTime(windowFrom),
      lookbackFrom: convertDateToClickhouseDateTime(
        new Date(windowFrom.getTime() - BILLING_LOOKBACK_MS),
      ),
      lookbackSeconds: BILLING_LOOKBACK_MS / 1000,
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
