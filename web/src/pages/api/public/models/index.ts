import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetModelsV1Query,
  GetModelsV1Response,
  PostModelsV1Body,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import {
  createModelForApi,
  listModelsForApi,
} from "@/src/features/models/server/publicApiModelService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get model definitions",
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
