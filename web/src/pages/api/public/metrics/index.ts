import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV1Query,
  GetMetricsV1Response,
} from "@/src/features/public-api/types/metrics";

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

        // This is a dummy implementation as requested
        // In the future, this would call the actual query execution logic

        // Return dummy data for now
        return {
          data: [
            {
              metric: "dummy_metric",
              value: 42,
              timestamp: new Date().toISOString(),
            },
          ],
          meta: {
            page: queryParams.page,
            limit: queryParams.limit,
            totalItems: 1,
            totalPages: 1,
          },
        };
      } catch (error) {
        logger.error("Error in metrics API", { error, query });
        throw error;
      }
    },
  }),
});
