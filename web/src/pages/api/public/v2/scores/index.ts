import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV2,
  GetScoresResponseV2,
  filterAndValidateV2GetScoreList,
  InvalidRequestError,
} from "@langfuse/shared";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { logger } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQueryV2,
    responseSchema: GetScoresResponseV2,
    fn: async ({ query, auth }) => {
      // Validate that trace filters are not used when trace field is excluded
      const requestedFields = query.fields ?? ["score", "trace"];

      if (!requestedFields.includes("score")) {
        throw new InvalidRequestError("Scores needs to be selected always.");
      }

      const includesTrace = requestedFields.includes("trace");
      const hasTraceFilters = Boolean(query.userId || query.traceTags);

      logger.info(
        `fields: ${query.fields}, includesTrace: ${includesTrace}, hasTraceFilters: ${hasTraceFilters}`,
      );

      if (!includesTrace && hasTraceFilters) {
        throw new InvalidRequestError(
          "Cannot filter by trace properties (userId, traceTags) when 'trace' field is not included. Please add 'trace' to the fields parameter or remove trace filters.",
        );
      }

      const scoreParams = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        userId: query.userId ?? undefined,
        name: query.name ?? undefined,
        configId: query.configId ?? undefined,
        sessionId: query.sessionId ?? undefined,
        traceId: query.traceId ?? undefined,
        observationId: query.observationId ?? undefined,
        datasetRunId: query.datasetRunId ?? undefined,
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
        fields: query.fields ?? undefined,
      };
      const scoresApiService = new ScoresApiService("v2");
      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi(scoreParams),
        scoresApiService.getScoresCountForPublicApi(scoreParams),
      ]);

      const finalCount = count ? count : 0;

      return {
        data: filterAndValidateV2GetScoreList(items),
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
