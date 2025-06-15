import {
  GetMetricsDailyV1Query,
  GetMetricsDailyV1Response,
} from "@/src/features/public-api/types/metrics";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  generateDailyMetrics,
  getDailyMetricsCount,
} from "@/src/features/public-api/server/dailyMetrics";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Daily Metrics",
    querySchema: GetMetricsDailyV1Query,
    responseSchema: GetMetricsDailyV1Response,
    rateLimitResource: "public-api-daily-metrics-legacy",
    fn: async ({ query, auth }) => {
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        traceName: query.traceName ?? undefined,
        userId: query.userId ?? undefined,
        tags: query.tags ?? undefined,
        // We need to map environment to both keys to propagate the filter to all tables.
        traceEnvironment: query.environment ?? undefined,
        observationEnvironment: query.environment ?? undefined,
        fromTimestamp: query.fromTimestamp ?? undefined,
        toTimestamp: query.toTimestamp ?? undefined,
      };

      const [usage, count] = await Promise.all([
        generateDailyMetrics(filterProps),
        getDailyMetricsCount(filterProps),
      ]);

      const finalCount = count || 0;
      return {
        data: usage,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };
    },
  }),
});
