import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreV3,
  GetScoreResponseV3,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { getScoreV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { env } from "@/src/env.mjs";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Score V3",
    querySchema: GetScoreV3,
    responseSchema: GetScoreResponseV3,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_SCORES_V3_API !== "true") {
        throw new LangfuseNotFoundError(
          "v3 Scores API is not enabled on this instance",
        );
      }

      const score = await getScoreV3ForPublicApi({
        projectId: auth.scope.projectId,
        scoreId: query.scoreId,
      });

      if (!score) {
        throw new LangfuseNotFoundError("Score not found");
      }

      return score;
    },
  }),
});
