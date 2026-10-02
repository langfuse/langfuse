import { env } from "../../env";
import { queryClickhouse } from "../repositories";
import { quoteClickhouseString } from "./clickhouseIdentifiers";

// ============================================================================
// Types
// ============================================================================

export type QueryStatus = "running" | "completed" | "failed" | "not_found";

// ============================================================================
// Utilities
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a system-table reference, optionally wrapped in clusterAllReplicas
 * when CH is deployed as a cluster. Single-node deployments (self-hosted) read
 * the local table directly.
 */
export function systemTableRef(
  table: "system.processes" | "system.query_log",
): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    const clusterName = quoteClickhouseString(env.CLICKHOUSE_CLUSTER_NAME);
    if (table === "system.query_log") {
      return `clusterAllReplicas(${clusterName}, merge(system, '^query_log*'))`;
    }
    return `clusterAllReplicas(${clusterName}, '${table}')`;
  }
  return table;
}

// ============================================================================
// Query Status Polling
// ============================================================================

/**
 * Bound log scans by the original submission time, never by the time of polling.
 * Five minutes of clock skew are allowed between the worker and ClickHouse.
 * event_date uses the server timezone, so its pruning bound includes the previous
 * UTC day as well. There is no upper bound: queries can run across days and resume
 * tracking much later. Missing or invalid timestamps retain unbounded coverage.
 */
function queryLogBound(startedAt?: string | Date): {
  sql: string;
  params: Record<string, string>;
} {
  const unbounded = { sql: "", params: {} };
  if (!startedAt) return unbounded;
  // Persisted timestamps must identify an instant, independent of worker timezone.
  if (
    typeof startedAt === "string" &&
    !/(Z|[+-]\d{2}:\d{2})$/i.test(startedAt)
  ) {
    return unbounded;
  }
  const submittedAt = new Date(startedAt).getTime();
  const skewMs = 5 * 60 * 1000;
  if (
    !Number.isFinite(submittedAt) ||
    submittedAt < skewMs ||
    submittedAt > Date.now() + skewMs
  ) {
    return unbounded;
  }
  // event_time has second precision; round down to retain the boundary second.
  const since = Math.floor((submittedAt - skewMs) / 1000) * 1000;
  return {
    sql: `AND event_date >= {queryLogSinceDate: Date}
          AND event_time >= {queryLogSince: DateTime64(3, 'UTC')}`,
    params: {
      queryLogSince: new Date(since)
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
      queryLogSinceDate: new Date(Math.max(0, since - 24 * 60 * 60 * 1000))
        .toISOString()
        .slice(0, 10),
    },
  };
}

/**
 * Polls ClickHouse to determine the status of a query by its query_id.
 * First checks system.processes for running queries, then system.query_log for completed/failed.
 * startedAt is the optional original submission time (Date or ISO timestamp).
 */
export async function pollQueryStatus(
  queryId: string,
  startedAt?: string | Date,
): Promise<QueryStatus> {
  // First check if still running in system.processes
  const running = await queryClickhouse<{ query_id: string }>({
    query: `
        SELECT query_id
        FROM ${systemTableRef("system.processes")}
        WHERE query_id = {queryId: String}
        LIMIT 1
      `,
    params: { queryId },
    clickhouseConfigs: {
      request_timeout: 60_000,
    },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
  });

  if (running.length > 0) {
    return "running";
  }
  // Check query_log for completion status
  const bound = queryLogBound(startedAt);
  const result = await queryClickhouse<{
    type: string;
    exception_code: string;
  }>({
    query: `
      SELECT type, exception_code
      FROM ${systemTableRef("system.query_log")}
      WHERE query_id = {queryId: String}
        ${bound.sql}
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId, ...bound.params },
    clickhouseConfigs: {
      request_timeout: 60_000,
    },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
  });

  if (result.length === 0) {
    return "not_found";
  }

  const { type, exception_code } = result[0];
  if (type === "QueryStart") {
    return "running";
  }

  if (
    type === "ExceptionBeforeStart" ||
    type === "ExceptionWhileProcessing" ||
    parseInt(exception_code, 10) !== 0
  ) {
    return "failed";
  }

  if (type === "QueryFinish") {
    return "completed";
  }

  throw new Error(`Unknown query log type: ${type}`);
}

/**
 * Gets the error message for a failed query from system.query_log.
 * startedAt is the optional original submission time (Date or ISO timestamp).
 */
export async function getQueryError(
  queryId: string,
  startedAt?: string | Date,
): Promise<string | undefined> {
  const bound = queryLogBound(startedAt);
  const result = await queryClickhouse<{ exception_message: string }>({
    query: `
      SELECT exception as exception_message
      FROM ${systemTableRef("system.query_log")}
      WHERE query_id = {queryId: String}
        AND type != 'QueryStart'
        AND exception != ''
        ${bound.sql}
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId, ...bound.params },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
  });

  return result[0]?.exception_message;
}
