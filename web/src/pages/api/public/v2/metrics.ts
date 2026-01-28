import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV2Query,
  GetMetricsV2Response,
} from "@/src/features/public-api/types/metrics";
import { InvalidRequestError, NotImplementedError } from "@langfuse/shared";
import {
  executeQuery,
  validateQuery,
} from "@/src/features/query/server/queryExecutor";

const DEFAULT_ROW_LIMIT = 100;

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Metrics V2",
    rateLimitResource: "public-api-metrics", // Same rate limit as v1
    querySchema: GetMetricsV2Query,
    responseSchema: GetMetricsV2Response,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS !== "true") {
        throw new NotImplementedError(
          "v2 APIs are currently in beta and only available on Langfuse Cloud",
        );
      }

      try {
        // Validate query (high cardinality checks) BEFORE applying defaults
        // This ensures users must explicitly opt-in with row_limit for high cardinality queries
        const validation = validateQuery(query.query as any, "v2");

        if (!validation.valid) {
          throw new InvalidRequestError(validation.reason);
        }

        // Apply default row_limit AFTER validation
        const queryParams = {
          ...query.query,
          config: {
            ...query.query.config,
            row_limit: query.query.config?.row_limit ?? DEFAULT_ROW_LIMIT,
          },
        };

        logger.info("Received v2 metrics query", {
          query: queryParams,
          version: "v2",
          projectId: auth.scope.projectId,
        });

        // Explicitly use v2 (events table)
        const result = await executeQuery(
          auth.scope.projectId,
          queryParams,
          "v2",
          true /* always enable single-level SELECT optimization for public API v2 */,
        );

        return { data: result };
      } catch (error) {
        logger.error("Error in v2 metrics API", { error, query });
        throw error;
      }
    },
  }),
});
