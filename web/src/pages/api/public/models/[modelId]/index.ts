import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteModelV1Query,
  DeleteModelV1Response,
  GetModelV1Query,
  GetModelV1Response,
} from "@/src/features/public-api/types/models";
import {
  deleteModelForApi,
  getModelForApi,
} from "@/src/features/models/server/publicApiModelService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get model definitions",
    querySchema: GetModelV1Query,
    responseSchema: GetModelV1Response,
    fn: async ({ query, auth }) => {
      return await getModelForApi({
        projectId: auth.scope.projectId,
        modelId: query.modelId,
      });
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete model",
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
