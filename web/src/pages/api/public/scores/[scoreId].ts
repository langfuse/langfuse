import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  DeleteScoreQueryV1,
  DeleteScoreResponseV1,
  GetScoreQueryV1,
  GetScoreResponseV1,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Score",
    querySchema: GetScoreQueryV1,
    responseSchema: GetScoreResponseV1,
    rejectInEventsOnlyMode: true,
    fn: async ({ query, auth }) => {
      const scoresApiService = new ScoresApiService("v1");
      const score = await scoresApiService.getScoreById({
        projectId: auth.scope.projectId,
        scoreId: query.scoreId,
      });

      if (!score) {
        throw new LangfuseNotFoundError("Score not found");
      }

      const parsedScore = GetScoreResponseV1.safeParse(score);

      if (!parsedScore.success) {
        traceException(parsedScore.error);
        logger.error(`Incorrect score return type ${parsedScore.error}`);
        throw new InternalServerError("Requested score is corrupted");
      }

      return parsedScore.data;
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Score",
    querySchema: DeleteScoreQueryV1,
    responseSchema: DeleteScoreResponseV1,
    rateLimitResource: "score-delete",
    successStatusCode: 202,
    fn: async ({ query, auth }) => {
      const { scoreId } = query;

      const scoresApiService = new ScoresApiService("v1");
      return await scoresApiService.deleteScore({
        scoreId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });
    },
  }),
});
