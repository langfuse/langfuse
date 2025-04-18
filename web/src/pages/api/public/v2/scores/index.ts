import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV2,
  GetScoresResponseV2,
  legacyFilterAndValidateV2GetScoreList,
} from "@langfuse/shared";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQueryV2,
    responseSchema: GetScoresResponseV2,
    fn: async ({ query, auth }) => {
      const scoreParams = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        userId: query.userId ?? undefined,
        name: query.name ?? undefined,
        configId: query.configId ?? undefined,
        queueId: query.queueId ?? undefined,
        traceTags: query.traceTags ?? undefined,
        dataType: query.dataType ?? undefined,
        fromTimestamp: query.fromTimestamp ?? undefined,
        toTimestamp: query.toTimestamp ?? undefined,
        environment: query.environment ?? undefined,
        traceEnvironment: query.environment ?? undefined,
        source: query.source ?? undefined,
        value: query.value ?? undefined,
        operator: query.operator ?? undefined,
        scoreIds: query.scoreIds ?? undefined,
      };
      const scoresApiService = new ScoresApiService("v2");
      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi(scoreParams),
        scoresApiService.getScoresCountForPublicApi(scoreParams),
      ]);

      const finalCount = count ? count : 0;

      return {
        data: legacyFilterAndValidateV2GetScoreList(items),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };
    },
  }),
  // Question: do I copy the POST route from v1?
});
