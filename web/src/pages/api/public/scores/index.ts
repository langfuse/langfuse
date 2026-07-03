import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV1,
  GetScoresResponseV1,
  filterAndValidateLegacyV1GetScoreList,
  PostScoresBodyV1,
  PostScoresResponseV1,
} from "@langfuse/shared";
import {
  createIngestionAttribution,
  logger,
} from "@langfuse/shared/src/server";
import { ForbiddenError } from "@langfuse/shared";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { randomUUID } from "crypto";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBodyV1,
    responseSchema: PostScoresResponseV1,
    allowedAccessLevels: ["project", "scores"],
    fn: async ({ body, auth, req, res }) => {
      if (auth.scope.isIngestionSuspended) {
        throw new ForbiddenError(
          "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
        );
      }

      const conformedBody = {
        ...body,
        // We previously used `if(!body.id)` to decide if a new ID should be generated,
        // this would accept falsy values such as empty string as valid IDs, and generate a new ID in that case.
        // The `createScore` uses `??` instead, which would break this behavior, so we use `||` here to maintain the old behavior.
        id: body.id || randomUUID(),
      };

      const scoresApiService = new ScoresApiService("v1");
      const { id, result } = await scoresApiService.createScore({
        body: conformedBody,
        auth,
        attribution: createIngestionAttribution({
          headers: req.headers,
          authCheck: auth,
        }),
      });
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
      return { id };
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQueryV1,
    responseSchema: GetScoresResponseV1,
    rejectInEventsOnlyMode: true,
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
        source: query.source ?? undefined,
        value: query.value ?? undefined,
        operator: query.operator ?? undefined,
        scoreIds: query.scoreIds ?? undefined,
        advancedFilters: query.filter,
      };
      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi(scoreParams),
        scoresApiService.getScoresCountForPublicApi(scoreParams),
      ]);

      const finalCount = count ? count : 0;

      return {
        // As these are traces scores, we expect all scores to have a traceId set
        // For type consistency, we validate the scores against the v1 schema which requires a traceId
        data: filterAndValidateLegacyV1GetScoreList(items),
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
