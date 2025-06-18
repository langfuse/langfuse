import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreQueryV2,
  GetScoreResponseV2,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Score",
    querySchema: GetScoreQueryV2,
    responseSchema: GetScoreResponseV2,
    fn: async ({ query, auth }) => {
      const scoresApiService = new ScoresApiService("v2");
      const score = await scoresApiService.getScoreById({
        projectId: auth.scope.projectId,
        scoreId: query.scoreId,
      });

      if (!score) {
        throw new LangfuseNotFoundError("Score not found");
      }

      const parsedScore = GetScoreResponseV2.safeParse(score);

      if (!parsedScore.success) {
        traceException(parsedScore.error);
        logger.error(`Incorrect score return type ${parsedScore.error}`);
        throw new InternalServerError("Requested score is corrupted");
      }

      return parsedScore.data;
    },
  }),
});
