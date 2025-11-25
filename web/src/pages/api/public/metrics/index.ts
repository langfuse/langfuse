import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV1Query,
  GetMetricsV1Response,
} from "@/src/features/public-api/types/metrics";
import { executeQuery } from "@/src/features/query/server/queryExecutor";

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
        const result = await executeQuery(auth.scope.projectId, queryParams);

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
