import { v4 } from "uuid";

import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQuery,
  GetScoresResponse,
  legacyFilterAndValidateV1GetScoreList,
  PostScoresBody,
  PostScoresResponse,
} from "@langfuse/shared";
import {
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import {
  generateScoresForPublicApi,
  getScoresCountForPublicApi,
} from "@/src/features/public-api/server/scores";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBody,
    responseSchema: PostScoresResponse,
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
  GET: createAuthedAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQuery,
    responseSchema: GetScoresResponse,
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
      const [items, count] = await Promise.all([
        generateScoresForPublicApi(scoreParams),
        getScoresCountForPublicApi(scoreParams),
      ]);

      const finalCount = count ? count : 0;

      return {
        data: legacyFilterAndValidateV1GetScoreList(items),
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
