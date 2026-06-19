import { env } from "../../env";
import { queryClickhouse } from "../repositories";

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
function systemTableRef(
  table: "system.processes" | "system.query_log",
): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return `clusterAllReplicas('${env.CLICKHOUSE_CLUSTER_NAME}', '${table}')`;
  }
  return table;
}

// ============================================================================
// Query Status Polling
// ============================================================================

/**
 * Polls ClickHouse to determine the status of a query by its query_id.
 * First checks system.processes for running queries, then system.query_log for completed/failed.
 */
export async function pollQueryStatus(
  queryId: string,
  tags?: Record<string, string>,
): Promise<QueryStatus> {
  const tagsWithDefaults = {
    feature: "query-tracking",
    operation: "pollQueryStatus",
    ...tags,
  };
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
    tags: tagsWithDefaults,
  });

  if (running.length > 0) {
    return "running";
  }
  // Check query_log for completion status
  const result = await queryClickhouse<{
    type: string;
    exception_code: string;
  }>({
    query: `
      SELECT type, exception_code
      FROM ${systemTableRef("system.query_log")}
      WHERE query_id = {queryId: String}
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId },
    clickhouseConfigs: {
      request_timeout: 60_000,
    },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: tagsWithDefaults,
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
 * Reads the result row count for a completed query from system.query_log.
 * Used by the blob-export raw-passthrough path (LFE-10402), where rows are
 * never materialized in JS so the count can't be tallied client-side.
 * Returns undefined if the query_log row isn't present yet.
 */
export async function getQueryResultRows(
  queryId: string,
): Promise<number | undefined> {
  const result = await queryClickhouse<{ result_rows: string }>({
    query: `
      SELECT result_rows
      FROM ${systemTableRef("system.query_log")}
      WHERE query_id = {queryId: String}
        AND type = 'QueryFinish'
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: {
      feature: "query-tracking",
      operation: "getQueryResultRows",
    },
  });

  const raw = result[0]?.result_rows;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Gets the error message for a failed query from system.query_log.
 */
export async function getQueryError(
  queryId: string,
): Promise<string | undefined> {
  const result = await queryClickhouse<{ exception_message: string }>({
    query: `
      SELECT exception as exception_message
      FROM ${systemTableRef("system.query_log")}
      WHERE query_id = {queryId: String}
        AND type != 'QueryStart'
        AND exception != ''
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: {
      feature: "query-tracking",
      operation: "getQueryError",
    },
  });

  return result[0]?.exception_message;
}
