import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType = "observation" | "trace" | "score";

const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;

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
 * The table is created by `clickhouse/scripts/dev-tables.sh` locally and by
 * hand on Langfuse Cloud. Where it does not exist, the query fails.
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
