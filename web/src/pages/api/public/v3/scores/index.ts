import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV3,
  GetScoresResponseV3,
  LangfuseNotFoundError,
  type ScoreFieldGroupV3,
} from "@langfuse/shared";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { EncodedScoresCursorV3 } from "@/src/features/public-api/types/scores";
import { env } from "@/src/env.mjs";

const GetScoresV3Query = GetScoresQueryV3.extend({
  cursor: EncodedScoresCursorV3.optional(),
});

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores V3",
    querySchema: GetScoresV3Query,
    responseSchema: GetScoresResponseV3,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_SCORES_V3_API !== "true") {
        // Generic message to avoid disclosing the feature-flag existence to
        // unauthenticated probes. Cloud has the flag on; self-hosted gets 404.
        throw new LangfuseNotFoundError("Not Found");
      }

      const result = await listScoresV3ForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
        cursor: query.cursor,
        fields: query.fields as ScoreFieldGroupV3[],
      });

      return {
        data: result.data,
        meta: {
          limit: query.limit,
          ...(result.cursor ? { cursor: result.cursor } : {}),
        },
      };
    },
  }),
});
