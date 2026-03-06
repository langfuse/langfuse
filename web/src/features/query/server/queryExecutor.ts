import { queryClickhouse, measureAndReturn } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType, type ViewVersion } from "@/src/features/query/types";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import { env } from "@/src/env.mjs";

// Re-export validation logic (shared between server and client)
export {
  validateQuery,
  type QueryValidationResult,
} from "@/src/features/query/validateQuery";

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
          ...(env.CLICKHOUSE_USE_QUERY_CONDITION_CACHE === "true"
            ? { use_query_condition_cache: "true" }
            : {}),
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
            ...(env.CLICKHOUSE_USE_QUERY_CONDITION_CACHE === "true"
              ? { use_query_condition_cache: "true" }
              : {}),
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
