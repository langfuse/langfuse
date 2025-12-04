import { queryClickhouse, measureAndReturn } from "@langfuse/shared/src/server";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { type QueryType, type ViewVersion } from "@/src/features/query/types";

/**
 * Execute a query using the QueryBuilder.
 *
 * @param projectId - The project ID
 * @param query - The query configuration as defined in QueryType
 * @param version - The view version to use (v1 or v2), defaults to v1
 * @returns The query result data
 */
export async function executeQuery(
  projectId: string,
  query: QueryType,
  version: ViewVersion = "v1",
): Promise<Array<Record<string, unknown>>> {
  const { query: compiledQuery, parameters } = await new QueryBuilder(
    query.chartConfig,
    version,
  ).build(query, projectId);

  // Check if the query contains trace table references
  const usesTraceTable = compiledQuery.includes("traces");

  if (!usesTraceTable) {
    // No trace table placeholders, execute normally
    const result = await queryClickhouse<Record<string, unknown>>({
      query: compiledQuery,
      params: parameters,
      clickhouseConfigs: {
        clickhouse_settings: {
          date_time_output_format: "iso",
        },
      },
      tags: {
        feature: "custom-queries",
        type: query.view,
        kind: "analytic",
        projectId,
      },
    });
    return result;
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
        feature: "custom-queries",
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
