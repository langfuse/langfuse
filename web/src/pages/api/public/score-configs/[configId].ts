import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  getScoreConfig,
  updateScoreConfig,
} from "@/src/features/public-api/server/score-configs-api-service";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
  PutScoreConfigBody as PatchScoreConfigBody,
  PutScoreConfigQuery as PatchScoreConfigQuery,
  PutScoreConfigResponse as PatchScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get a Score Config",
    querySchema: GetScoreConfigQuery,
    responseSchema: GetScoreConfigResponse,
    fn: async ({ query, auth }) => {
      return await getScoreConfig({
        projectId: auth.scope.projectId,
        configId: query.configId,
      });
    },
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update a Score Config",
    querySchema: PatchScoreConfigQuery,
    bodySchema: PatchScoreConfigBody,
    responseSchema: PatchScoreConfigResponse,
    fn: async ({ query, body, auth }) => {
      return await updateScoreConfig({
        context: auth.scope,
        configId: query.configId,
        body,
      });
    },
  }),
});
