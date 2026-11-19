import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType =
  | "observation"
  | "trace"
  | "score"
  | "topic_facet_summary";

const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Billing is defined per 15-minute window of `ingested_at`. */
export const BILLING_WINDOW_MS = 15 * 60 * 1000;

/**
 * How long after its end a billing window still receives inserts. Counting a
 * window earlier under-bills it.
 */
export const BILLING_WINDOW_SETTLE_MS = 5 * 60 * 1000;

/**
 * Counts the billable units per project and event type in `[from, to)` as the
 * sum of its 15-minute windows. Each window counts a unit as
 * `getBillableUnitCountsByProjectInWindow` does, so an hour is the sum of its
 * four quarter-hours and every range agrees with the windows inside it.
 *
 * `from` and `to` must fall on 15-minute boundaries. One query serves the
 * whole range: a unit counts in each window where it appears and has no other
 * appearance in the 24 hours before that window starts.
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
  if (
    from.getTime() % BILLING_WINDOW_MS !== 0 ||
    to.getTime() % BILLING_WINDOW_MS !== 0
  ) {
    throw new Error(
      `Billing range must start and end on 15-minute boundaries, got ${from.toISOString()} to ${to.toISOString()}`,
    );
  }

  const projectFilter = projectId ? "AND project_id = {projectId: String}" : "";

  // `windows` holds the sorted window starts in which a unit appears, and
  // `last_lookback_window` the latest one in the 24 hours before the range (0
  // when there is none). A window counts when the unit's previous appearance
  // started more than 24 hours earlier. The lookback only reads ids that also
  // appear in the range, so memory grows with the range, not with the lookback.
  const query = `
    WITH range_units AS (
      SELECT
        project_id,
        event_type,
        event_id,
        arraySort(groupUniqArray(toUInt32(toStartOfFifteenMinutes(ingested_at)))) AS windows
      FROM billable_events
      WHERE ingested_at >= {from: DateTime64(3, 'UTC')}
      AND ingested_at < {to: DateTime64(3, 'UTC')}
      ${projectFilter}
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
      AND ingested_at < {from: DateTime64(3, 'UTC')}
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
          (windowStart, previousStart) -> windowStart - previousStart > {lookbackSeconds: UInt32},
          r.windows,
          arrayPushFront(arrayPopBack(r.windows), l.last_lookback_window)
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
      lookbackFrom: convertDateToClickhouseDateTime(
        new Date(from.getTime() - BILLING_LOOKBACK_MS),
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

/**
 * Counts the billable units per project and event type ingested in
 * `[windowFrom, windowTo)` of `billable_events.ingested_at`. Each unit counts
 * once per window, and not at all if its id was also ingested in the 24 hours
 * before `windowFrom`. A re-sent or long-running trace is therefore billed once
 * as long as it never goes 24 hours without new data.
 *
 * `billable_events` is never deleted from, so a closed window always
 * recomputes to the same counts. A window still receives inserts until a few
 * minutes after `windowTo`; counting it earlier under-bills.
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
