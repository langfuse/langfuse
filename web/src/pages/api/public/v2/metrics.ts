import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV2Query,
  GetMetricsV2Response,
} from "@/src/features/public-api/types/metrics";
import { executeQuery } from "@/src/features/query/server/queryExecutor";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import { InvalidRequestError } from "@langfuse/shared";

const DEFAULT_ROW_LIMIT = 100;

/**
 * Validates that no high cardinality dimensions are used in the query.
 * High cardinality dimensions (id, traceId, userId, sessionId, etc.) are not
 * supported in the v2 metrics API as they can cause performance issues.
 */
function validateNoHighCardinalityDimensions(queryParams: {
  view: string;
  dimensions?: Array<{ field: string }>;
}): void {
  if (!queryParams.dimensions || queryParams.dimensions.length === 0) {
    return;
  }

  const view = getViewDeclaration(queryParams.view as any, "v2");

  for (const dimension of queryParams.dimensions) {
    const dim = view.dimensions[dimension.field];
    if (dim?.highCardinality) {
      throw new InvalidRequestError(
        `Dimension '${dimension.field}' has high cardinality and is not supported in v2 metrics API. Use filters instead.`,
      );
    }
  }
}

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Metrics V2",
    rateLimitResource: "public-api-metrics", // Same rate limit as v1
    querySchema: GetMetricsV2Query,
    responseSchema: GetMetricsV2Response,
    fn: async ({ query, auth }) => {
      try {
        const queryParams = {
          ...query.query,
          // Apply default row_limit if not specified
          config: {
            ...query.query.config,
            row_limit: query.query.config?.row_limit ?? DEFAULT_ROW_LIMIT,
          },
        };

        // Validate no high cardinality dimensions are used
        validateNoHighCardinalityDimensions(queryParams);

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
