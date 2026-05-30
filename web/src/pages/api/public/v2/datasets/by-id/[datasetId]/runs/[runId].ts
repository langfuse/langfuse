import {
  DeleteDatasetRunV2ByIdQuery,
  DeleteDatasetRunV2ByIdResponse,
  GetDatasetRunV2ByIdQuery,
  GetDatasetRunV2ByIdResponse,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  deleteDatasetRunByIdForApi,
  getDatasetRunByIdForApi,
} from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-run-by-id",
    querySchema: GetDatasetRunV2ByIdQuery,
    responseSchema: GetDatasetRunV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await getDatasetRunByIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        datasetRunId: query.runId,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset-run-by-id",
    querySchema: DeleteDatasetRunV2ByIdQuery,
    responseSchema: DeleteDatasetRunV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await deleteDatasetRunByIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        datasetRunId: query.runId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      }),
  }),
});
