import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV1Query,
  GetMetricsV1Response,
} from "@/src/features/public-api/types/metrics";
import { QueryBuilder } from "@/src/features/query/server/queryBuilder";
import { queryClickhouse } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Metrics",
    rateLimitResource: "public-api-metrics",
    querySchema: GetMetricsV1Query,
    responseSchema: GetMetricsV1Response,
    fn: async ({ query, auth }) => {
      try {
        // Extract the parsed query object
        const queryParams = query.query;

        // Log the received query for debugging
        logger.info("Received metrics query", {
          query: queryParams,
          projectId: auth.scope.projectId,
        });

        // Execute the query using QueryBuilder
        const { query: compiledQuery, parameters } = new QueryBuilder(
          queryParams.config,
        ).build(queryParams, auth.scope.projectId);

        // Run the query against ClickHouse
        const result = await queryClickhouse<Record<string, unknown>>({
          query: compiledQuery,
          params: parameters,
          clickhouseConfigs: {
            clickhouse_settings: {
              date_time_output_format: "iso",
            },
          },
          tags: {
            feature: "metrics-api",
            type: queryParams.view,
            kind: "analytic",
            projectId: auth.scope.projectId,
          },
        });

        // Format and return the result
        return {
          data: result,
          // meta: {
          //   page: queryParams.page,
          //   limit: queryParams.limit,
          //   totalItems: result.length,
          //   totalPages: Math.ceil(result.length / queryParams.limit),
          // },
        };
      } catch (error) {
        logger.error("Error in metrics API", { error, query });
        throw error;
      }
    },
  }),
});
