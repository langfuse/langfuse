import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV2Query,
  GetMetricsV2Response,
} from "@/src/features/public-api/types/metrics";
import { executeQuery } from "@/src/features/query/server/queryExecutor";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Metrics V2",
    rateLimitResource: "public-api-metrics", // Same rate limit as v1
    querySchema: GetMetricsV2Query,
    responseSchema: GetMetricsV2Response,
    fn: async ({ query, auth }) => {
      try {
        const queryParams = query.query;

        // Map observations view to events-observations internally
        let resolvedQuery = queryParams;
        if (queryParams.view === "observations") {
          resolvedQuery = {
            ...queryParams,
            view: "events-observations", // Always use events table
          };
        }

        logger.info("Received v2 metrics query", {
          query: resolvedQuery,
          version: "v2",
          projectId: auth.scope.projectId,
        });

        const result = await executeQuery(auth.scope.projectId, resolvedQuery);

        return { data: result };
      } catch (error) {
        logger.error("Error in v2 metrics API", { error, query });
        throw error;
      }
    },
  }),
});
