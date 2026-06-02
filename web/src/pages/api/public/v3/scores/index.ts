import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresV3,
  GetScoresResponseV3,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { EncodedScoresCursorV3 } from "@/src/features/public-api/types/scores";
import { env } from "@/src/env.mjs";

const GetScoresV3Query = GetScoresV3.extend({
  cursor: EncodedScoresCursorV3.optional(),
});

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores V3",
    querySchema: GetScoresV3Query,
    responseSchema: GetScoresResponseV3,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_SCORES_V3_API !== "true") {
        throw new LangfuseNotFoundError(
          "v3 Scores API is not enabled on this instance",
        );
      }

      const result = await listScoresV3ForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
        cursor: query.cursor,
        fields: query.fields,
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
