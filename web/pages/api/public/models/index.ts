import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  GetModelsV1Query,
  GetModelsV1Response,
  PostModelsV1Body,
  PostModelsV1Response,
} from "@/src/public-api/types/models";
import {
  createModelForApi,
  listModelsForApi,
} from "@/src/ai/model-catalog/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get model definitions",
    action: "models:read",
    isAdminApiKeyAuthAllowed: true,
    querySchema: GetModelsV1Query,
    responseSchema: GetModelsV1Response,
    fn: async ({ query, auth }) => {
      return await listModelsForApi({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      });
    },
  }),

  POST: createAuthedProjectAPIRoute({
    name: "Create custom model definition",
    action: "models:CUD",
    isAdminApiKeyAuthAllowed: true,
    bodySchema: PostModelsV1Body,
    responseSchema: PostModelsV1Response,
    fn: async ({ body, auth }) => {
      return await createModelForApi({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      });
    },
  }),
});
