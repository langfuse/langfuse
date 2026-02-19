import { queryClickhouse, measureAndReturn } from "@langfuse/shared/src/server";
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

  // Build the query (with or without optimization based on flag)
  const { query: compiledQuery, parameters } = await queryBuilder.build(
    query,
    projectId,
    enableSingleLevelOptimization,
  );

  // Check if the query contains trace table references
  const usesTraceTable = compiledQuery.includes("traces");

  // Route events_core queries to the dedicated events read replica.
  // Checked via the view declaration's baseCte rather than scanning the compiled SQL.
  const view = getViewDeclaration(query.view, version);
  const preferredClickhouseService = view.baseCte.includes("events_")
    ? ("EventsReadOnly" as const)
    : undefined;

  const tags = {
    feature: "custom-queries",
    type: query.view,
    kind: "analytic",
    projectId,
  };

  if (!usesTraceTable) {
    // No trace table placeholders, execute normally
    return queryClickhouse<Record<string, unknown>>({
      query: compiledQuery,
      params: parameters,
      clickhouseConfigs: {
        clickhouse_settings: {
          date_time_output_format: "iso",
          max_bytes_before_external_group_by: String(
            env.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
          ),
        },
      },
      tags,
      preferredClickhouseService,
    });
  }

  // Use measureAndReturn for trace table queries
  return measureAndReturn({
    operationName: "executeQuery",
    projectId,
    input: {
      query: compiledQuery,
      params: parameters,
      fromTimestamp: query.fromTimestamp,
      tags: {
        ...tags,
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
        preferredClickhouseService,
      });
    },
  });
}
