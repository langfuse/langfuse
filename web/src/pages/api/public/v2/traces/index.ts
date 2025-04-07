import {
  GetTracesV2Query,
  GetTracesV2Response,
} from "@/src/features/public-api/types/traces";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { TracesApiService } from "@/src/features/public-api/server/traces-api-service";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Traces",
    querySchema: GetTracesV2Query,
    responseSchema: GetTracesV2Response,
    fn: async ({ query, auth }) => {
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        userId: query.userId ?? undefined,
        name: query.name ?? undefined,
        tags: query.tags ?? undefined,
        environment: query.environment ?? undefined,
        sessionId: query.sessionId ?? undefined,
        version: query.version ?? undefined,
        release: query.release ?? undefined,
        fromTimestamp: query.fromTimestamp ?? undefined,
        toTimestamp: query.toTimestamp ?? undefined,
      };

      const tracesApiService = new TracesApiService("v2");

      const [items, count] = await Promise.all([
        tracesApiService.generateTracesForPublicApi(
          filterProps,
          query.orderBy ?? null,
        ),
        tracesApiService.getTracesCountForPublicApi(filterProps),
      ]);

      const finalCount = count || 0;
      return {
        data: items.map((item) => ({
          ...item,
          externalId: null,
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };
    },
  }),
  // Question: do I copy the DELETE route from v1?
  // Question: do I copy the POST route from v1?
});
