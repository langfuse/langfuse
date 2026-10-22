import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteModelV1Query,
  DeleteModelV1Response,
  GetModelV1Query,
  GetModelV1Response,
  PostModelsV1Body,
  PutModelV1Response,
} from "@/src/features/public-api/types/models";
import {
  deleteModelForApi,
  getModelForApi,
  upsertModelForApi,
} from "@/src/features/models/server/publicApiModelService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get model definitions",
    action: "models:read",
    isAdminApiKeyAuthAllowed: true,
    querySchema: GetModelV1Query,
    responseSchema: GetModelV1Response,
    fn: async ({ query, auth }) => {
      return await getModelForApi({
        projectId: auth.scope.projectId,
        modelId: query.modelId,
      });
    },
  }),

  PUT: createAuthedProjectAPIRoute({
    name: "Upsert custom model definition",
    action: "models:CUD",
    isAdminApiKeyAuthAllowed: true,
    querySchema: GetModelV1Query,
    bodySchema: PostModelsV1Body,
    responseSchema: PutModelV1Response,
    fn: async ({ query, body, auth }) => {
      return await upsertModelForApi({
        projectId: auth.scope.projectId,
        modelId: query.modelId,
        input: body,
        auditScope: auth.scope,
      });
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete model",
    action: "models:CUD",
    isAdminApiKeyAuthAllowed: true,
    querySchema: DeleteModelV1Query,
    responseSchema: DeleteModelV1Response,
    fn: async ({ query, auth }) => {
      return await deleteModelForApi({
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        modelId: query.modelId,
      });
    },
  }),
});
