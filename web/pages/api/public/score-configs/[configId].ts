import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  getScoreConfig,
  updateScoreConfig,
} from "@/src/public-api/server/score-configs-api-service";
import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import {
  GetScoreConfigQuery,
  GetScoreConfigResponse,
  PutScoreConfigBody as PatchScoreConfigBody,
  PutScoreConfigQuery as PatchScoreConfigQuery,
  PutScoreConfigResponse as PatchScoreConfigResponse,
} from "@/src/public-api/types/score-configs";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get a Score Config",
    action: "scoreConfigs:read",
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
    action: "scoreConfigs:CUD",
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
