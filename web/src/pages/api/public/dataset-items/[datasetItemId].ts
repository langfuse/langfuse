import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
  DeleteDatasetItemV1Query,
  DeleteDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  deleteDatasetItemForApi,
  getDatasetItemForApi,
} from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Item",
    querySchema: GetDatasetItemV1Query,
    responseSchema: GetDatasetItemV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await getDatasetItemForApi({
        datasetItemId: query.datasetItemId,
        projectId: auth.scope.projectId,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Dataset Item",
    querySchema: DeleteDatasetItemV1Query,
    responseSchema: DeleteDatasetItemV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await deleteDatasetItemForApi({
        datasetItemId: query.datasetItemId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      }),
  }),
});
