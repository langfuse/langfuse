import {
  GetMetricsDailyV1Query,
  GetMetricsDailyV1Response,
} from "@/src/features/public-api/types/metrics";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  generateDailyMetrics,
  getDailyMetricsCount,
} from "@/src/features/public-api/server/dailyMetrics";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Daily Metrics",
    querySchema: GetMetricsDailyV1Query,
    responseSchema: GetMetricsDailyV1Response,
    rateLimitResource: "public-api-metrics",
    fn: async ({ query, auth }) => {
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        traceName: query.traceName ?? undefined,
        userId: query.userId ?? undefined,
        tags: query.tags ?? undefined,
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
