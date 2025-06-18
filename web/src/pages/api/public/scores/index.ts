import { v4 } from "uuid";

import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV1,
  GetScoresResponseV1,
  filterAndValidateV1GetScoreList,
  PostScoresBodyV1,
  PostScoresResponseV1,
} from "@langfuse/shared";
import {
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBodyV1,
    responseSchema: PostScoresResponseV1,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create score", { result });
        throw new Error("Failed to create score");
      }
      return { id: event.body.id };
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQueryV1,
    responseSchema: GetScoresResponseV1,
    fn: async ({ query, auth }) => {
      const scoresApiService = new ScoresApiService("v1");

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
      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi(scoreParams),
        scoresApiService.getScoresCountForPublicApi(scoreParams),
      ]);

      const finalCount = count ? count : 0;

      return {
        // As these are traces scores, we expect all scores to have a traceId set
        // For type consistency, we validate the scores against the v1 schema which requires a traceId
        data: filterAndValidateV1GetScoreList(items),
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
