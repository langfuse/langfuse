import {
  LEGACY_PUBLIC_API_METRICS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  withMiddlewares,
} from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import {
  GetMetricsV1Query,
  GetMetricsV1Response,
} from "@/src/features/public-api/types/metrics";
import { executeQuery } from "@langfuse/shared/query/server";
import { env } from "@/src/env.mjs";
export default withMiddlewares(
  {
    GET: createAuthedProjectAPIRoute({
      name: "Get Metrics",
      rateLimitResource: "public-api-metrics",
      // Only surface the migration hint where the v2 endpoint is actually
      // reachable (v2 APIs 404 unless the v4 preview opt-in is enabled). Note
      // v2/metrics reuses the same `public-api-metrics` rate-limit bucket as
      // v1, so the hint advertises improved performance, not higher limits.
      rateLimitMigrationMessage:
        env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
          ? "Migrate to the v2/metrics endpoint (GET /api/public/v2/metrics) for improved performance. Learn more at https://langfuse.com/docs/v4"
          : undefined,
      querySchema: GetMetricsV1Query,
      responseSchema: GetMetricsV1Response,
      // v1 metrics executes QueryBuilder against the legacy traces/observations
      // tables; the v2 endpoint at /api/public/v2/metrics targets events_full.
      rejectInEventsOnlyMode: true,
      fn: async ({ query, auth }) => {
        try {
          // Extract the parsed query object
          const queryParams = query.query;

          // Log the received query for debugging
          logger.debug("Received metrics query", {
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
  },
  {
    clickHouseResourceErrorMessage:
      LEGACY_PUBLIC_API_METRICS_CLICKHOUSE_RESOURCE_ERROR_MESSAGE,
  },
);
