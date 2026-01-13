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
        FROM clusterAllReplicas('default', 'system.processes')
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
      FROM clusterAllReplicas('default', 'system.query_log')
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
 * Gets the error message for a failed query from system.query_log.
 */
export async function getQueryError(
  queryId: string,
): Promise<string | undefined> {
  const result = await queryClickhouse<{ exception_message: string }>({
    query: `
      SELECT exception as exception_message
      FROM clusterAllReplicas('default', 'system.query_log')
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
