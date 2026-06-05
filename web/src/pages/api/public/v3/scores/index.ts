import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV3,
  GetScoresResponseV3,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { env } from "@/src/env.mjs";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores V3",
    querySchema: GetScoresQueryV3,
    responseSchema: GetScoresResponseV3,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_SCORES_V3_API !== "true") {
        // Generic message to avoid disclosing the feature-flag existence to
        // unauthenticated probes. Cloud has the flag on; self-hosted gets 404.
        throw new LangfuseNotFoundError("Not Found");
      }

      const items = await listScoresV3ForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
      });

      return {
        data: items,
        meta: {
          limit: query.limit,
        },
      };
    },
  }),
});
