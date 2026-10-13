import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type BillableEventType = "observation" | "trace" | "score";

const BILLING_WINDOW_MS = 15 * 60 * 1000;
const BILLING_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Counts the billable units per project and event type in one 15-minute
 * window of `billable_events.ingested_at`. A unit is billed in the window when
 * its id appears there and not in the 24 hours before the window starts, so a
 * re-sent or long-running trace is billed once as long as it never goes 24
 * hours without new data. Longer ranges are the sum of their 15-minute
 * windows.
 *
 * `billable_events` is never deleted from, so a closed window always
 * recomputes to the same counts. A window still receives inserts until a few
 * minutes after it ends; counting it earlier under-bills.
 *
 * The table is created by `clickhouse/scripts/dev-tables.sh` locally and by
 * hand on Langfuse Cloud. Where it does not exist, the query fails.
 */
export const getBillableUnitCountsByProjectInWindow = async ({
  windowStart,
  projectId,
}: {
  windowStart: Date;
  projectId?: string;
}): Promise<
  Array<{ projectId: string; eventType: BillableEventType; count: number }>
> => {
  if (windowStart.getTime() % BILLING_WINDOW_MS !== 0) {
    throw new Error(
      `Billing window start must be aligned to 15 minutes, got ${windowStart.toISOString()}`,
    );
  }

  const projectFilter = projectId ? "AND project_id = {projectId: String}" : "";

  // The NOT IN set only holds lookback ids that also appear in the window, so
  // memory grows with the window, not with the 24-hour lookback.
  const query = `
    WITH window_units AS (
      SELECT project_id, event_type, event_id
      FROM billable_events
      WHERE toStartOfFifteenMinutes(ingested_at) = {windowStart: DateTime64(3, 'UTC')}
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
      WHERE toStartOfFifteenMinutes(ingested_at) >= {lookbackStart: DateTime64(3, 'UTC')}
      AND toStartOfFifteenMinutes(ingested_at) < {windowStart: DateTime64(3, 'UTC')}
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
      windowStart: convertDateToClickhouseDateTime(windowStart),
      lookbackStart: convertDateToClickhouseDateTime(
        new Date(windowStart.getTime() - BILLING_LOOKBACK_MS),
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
