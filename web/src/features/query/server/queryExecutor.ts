import {
  queryClickhouse,
  measureAndReturn,
  logger,
} from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType, type ViewVersion } from "@/src/features/query/types";
import { env } from "@/src/env.mjs";

/**
 * Compares two query results for equivalence.
 * Returns true if results match, false otherwise.
 * Optimized for performance - avoids expensive JSON.stringify on large result sets.
 */
function compareQueryResults(
  result1: Array<Record<string, unknown>>,
  result2: Array<Record<string, unknown>>,
): boolean {
  if (result1.length !== result2.length) {
    return false;
  }

  if (result1.length === 0) {
    return true;
  }

  // Get all keys from first row of each result
  const keys1 = Object.keys(result1[0]);
  const keys2 = Object.keys(result2[0]);

  // Quick check: same number of columns
  if (keys1.length !== keys2.length) {
    return false;
  }

  // Sort keys once for performance (avoid sorting on every row)
  const sortedKeys = keys1.sort();

  // Create a simple hash for each row to enable fast comparison
  const createRowHash = (row: Record<string, unknown>): string => {
    // Use a simple concatenation of key-value pairs (sorted by key for consistency)
    return sortedKeys.map((k) => `${k}:${row[k]}`).join("|");
  };

  // Build sets of row hashes
  const hashes1 = new Set(result1.map(createRowHash));
  const hashes2 = new Set(result2.map(createRowHash));

  // Compare sets
  if (hashes1.size !== hashes2.size) {
    return false;
  }

  // Check if all hashes from result1 exist in result2
  for (const hash of hashes1) {
    if (!hashes2.has(hash)) {
      return false;
    }
  }

  return true;
}

/**
 * Execute a query using the QueryBuilder.
 *
 * @param projectId - The project ID
 * @param query - The query configuration as defined in QueryType
 * @param version - The view version to use (v1 or v2), defaults to v1
 * @param enableSingleLevelOptimization - Enable single-level SELECT optimization (default: false)
 * @returns The query result data
 */
export async function executeQuery(
  projectId: string,
  query: QueryType,
  version: ViewVersion = "v1",
  enableSingleLevelOptimization: boolean = false,
): Promise<Array<Record<string, unknown>>> {
  // Remap config to chartConfig for public API compatibility
  // Public API uses "config" while internal QueryType uses "chartConfig"
  const chartConfig =
    (query as unknown as { config?: QueryType["chartConfig"] }).config ??
    query.chartConfig;
  const queryBuilder = new QueryBuilder(chartConfig, version);

  // Build the primary query (with or without optimization based on flag)
  const { query: compiledQuery, parameters } = await queryBuilder.build(
    query,
    projectId,
    enableSingleLevelOptimization,
  );

  // Shadow testing: Build list of queries to execute in parallel
  const queriesToExecute: Array<{
    type: "regular" | "shadow";
    query: string;
    params: Record<string, unknown>;
  }> = [
    {
      type: "regular",
      query: compiledQuery,
      params: parameters,
    },
  ];

  // Add shadow test query if optimization is OFF and shadow testing is enabled
  const shadowTestEnabled =
    env.LANGFUSE_ENABLE_QUERY_OPTIMIZATION_SHADOW_TEST === "true";

  if (!enableSingleLevelOptimization && shadowTestEnabled) {
    const { query: optimizedQuery, parameters: optimizedParams } =
      await queryBuilder.build(query, projectId, true);

    // Only run shadow test if optimization actually changed the query
    if (optimizedQuery !== compiledQuery) {
      queriesToExecute.push({
        type: "shadow",
        query: optimizedQuery,
        params: optimizedParams,
      });
    }
  }

  // Check if the query contains trace table references
  const usesTraceTable = compiledQuery.includes("traces");

  // Execute all queries in parallel
  const results = await Promise.all(
    queriesToExecute.map(
      async (
        queryToExecute,
      ): Promise<Array<Record<string, unknown>> | null> => {
        try {
          if (!usesTraceTable) {
            // No trace table placeholders, execute normally
            return await queryClickhouse<Record<string, unknown>>({
              query: queryToExecute.query,
              params: queryToExecute.params,
              clickhouseConfigs: {
                clickhouse_settings: {
                  date_time_output_format: "iso",
                },
              },
              tags: {
                feature:
                  queryToExecute.type === "shadow"
                    ? "custom-queries-shadow-test"
                    : "custom-queries",
                type: query.view,
                kind: "analytic",
                projectId,
              },
            });
          } else {
            // Use measureAndReturn for trace table queries
            return await measureAndReturn({
              operationName: "executeQuery",
              projectId,
              input: {
                query: queryToExecute.query,
                params: queryToExecute.params,
                fromTimestamp: query.fromTimestamp,
                tags: {
                  feature:
                    queryToExecute.type === "shadow"
                      ? "custom-queries-shadow-test"
                      : "custom-queries",
                  type: query.view,
                  kind: "analytic",
                  projectId,
                  operation_name: "executeQuery",
                },
              },
              fn: async (input) => {
                return queryClickhouse<Record<string, unknown>>({
                  query: input.query,
                  params: input.params,
                  clickhouseConfigs: {
                    clickhouse_settings: {
                      date_time_output_format: "iso",
                    },
                  },
                  tags: input.tags,
                });
              },
            });
          }
        } catch (error) {
          // Only log shadow test errors
          if (queryToExecute.type === "shadow") {
            logger.warn("Shadow test query failed", {
              view: query.view,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
          // Re-throw errors from regular query
          throw error;
        }
      },
    ),
  );

  // Extract results - regularResult should never be null (would have thrown)
  const regularResult = results[0]!;
  const shadowResult = results[1] ?? null;

  // Compare shadow test results if available
  if (shadowResult !== null) {
    const resultsMatch = compareQueryResults(regularResult, shadowResult);

    if (resultsMatch) {
      // Log success (can be aggregated to track optimization coverage)
      logger.info("Shadow test: Optimization query matches", {
        view: query.view,
        version,
      });
    } else {
      // Log discrepancy with full details
      logger.error("Shadow test: Optimization query MISMATCH", {
        view: query.view,
        version,
        projectId,
        query: query,
        regularResultCount: regularResult.length,
        optimizedResultCount: shadowResult.length,
        regularResult: regularResult,
        optimizedResult: shadowResult,
      });
    }
  }

  return regularResult;
}
