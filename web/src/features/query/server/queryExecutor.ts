import {
  queryClickhouse,
  measureAndReturn,
  logger,
} from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType, type ViewVersion } from "@/src/features/query/types";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import { env } from "@/src/env.mjs";

/**
 * Result of query validation.
 * Either valid (query is safe to run) or invalid with a reason.
 */
export type QueryValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Gets the list of high cardinality dimension fields used in the query.
 *
 * @param query - The query configuration
 * @param version - The view version (v1 or v2)
 * @returns Array of high cardinality field names
 */
function getHighCardinalityDimensions(
  query: QueryType,
  version: ViewVersion,
): string[] {
  if (!query.dimensions || query.dimensions.length === 0) {
    return [];
  }

  const view = getViewDeclaration(query.view, version);
  return query.dimensions
    .filter((dim) => view.dimensions[dim.field]?.highCardinality)
    .map((dim) => dim.field);
}

/**
 * Finds the measure name that matches an orderBy field.
 * OrderBy fields can be:
 * - "{aggregation}_{measureName}" like "sum_totalCost" or "count_count"
 * - Just the measure name like "totalCost"
 * We search for known measure names as suffixes of the orderBy field.
 *
 * @param orderByField - The orderBy field string
 * @param knownMeasures - List of known measure names from the query
 * @returns The matching measure name, or null if no match found
 */
function findMeasureInOrderByField(
  orderByField: string,
  knownMeasures: string[],
): string | null {
  for (const measure of knownMeasures) {
    // Check exact match (e.g., orderBy: "totalCost" matches measure "totalCost")
    if (orderByField === measure) {
      return measure;
    }
    // Check suffix match (e.g., orderBy: "sum_totalCost" matches measure "totalCost")
    if (orderByField.endsWith(`_${measure}`)) {
      return measure;
    }
  }
  return null;
}

/**
 * Validates a query for safety before execution.
 * Performs sanity checks for high cardinality dimension validation.
 *
 * High cardinality dimensions (id, traceId, userId, sessionId, etc.) are only allowed when:
 * 1. config.row_limit (or chartConfig.row_limit) is explicitly specified (LIMIT)
 * 2. orderBy with direction 'desc' on a measure field is specified (for top-N queries)
 *
 * @param query - The query configuration (with original config, before defaults applied)
 * @param version - The view version (v1 or v2)
 * @returns Validation result: { valid: true } or { valid: false, reason: string }
 */
export function validateQuery(
  query: QueryType,
  version: ViewVersion,
): QueryValidationResult {
  // 1. Check for high cardinality dimensions
  const highCardDims = getHighCardinalityDimensions(query, version);

  if (highCardDims.length === 0) {
    return { valid: true };
  }

  // 2. Validate required conditions for high cardinality
  // Support both public API "config" and internal "chartConfig" field names
  const chartConfig =
    (query as unknown as { config?: QueryType["chartConfig"] }).config ??
    query.chartConfig;
  const hasExplicitLimit = chartConfig?.row_limit !== undefined;

  // 3. Validate ORDER BY - must have at least one desc on a measure field
  const orderByDescFields =
    query.orderBy?.filter((o) => o.direction === "desc") ?? [];

  if (!hasExplicitLimit || orderByDescFields.length === 0) {
    return {
      valid: false,
      reason: `High cardinality dimension(s) '${highCardDims.join(", ")}' require both 'config.row_limit' and 'orderBy' with direction 'desc' on a measure field.`,
    };
  }

  // Extract measure names from orderBy fields and validate they are measures in the query
  const queryMeasureNames = query.metrics.map((m) => m.measure);
  const invalidOrderByFields: string[] = [];

  for (const orderBy of orderByDescFields) {
    const matchedMeasure = findMeasureInOrderByField(
      orderBy.field,
      queryMeasureNames,
    );
    if (!matchedMeasure) {
      invalidOrderByFields.push(orderBy.field);
    }
  }

  if (invalidOrderByFields.length > 0) {
    return {
      valid: false,
      reason:
        `High cardinality dimension(s) '${highCardDims.join(", ")}' require 'orderBy' with direction 'desc' on a measure field. ` +
        `'${invalidOrderByFields.join(", ")}' ${invalidOrderByFields.length === 1 ? "is" : "are"} not a measure in this query.`,
    };
  }

  return { valid: true };
}

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
                  max_bytes_before_external_group_by: String(
                    env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
                  ),
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
                      max_bytes_before_external_group_by: String(
                        env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
                      ),
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
