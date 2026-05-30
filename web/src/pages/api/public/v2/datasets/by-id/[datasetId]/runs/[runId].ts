import {
  DeleteDatasetRunV2ByIdQuery,
  DeleteDatasetRunV2ByIdResponse,
  GetDatasetRunV2ByIdQuery,
  GetDatasetRunV2ByIdResponse,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  deleteDatasetRunByIdForApi,
  getDatasetRunByIdForApi,
} from "@/src/features/public-api/server/dataset-runs";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-run-by-id",
    querySchema: GetDatasetRunV2ByIdQuery,
    responseSchema: GetDatasetRunV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const result = await getDatasetRunByIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        runId: query.runId,
      });

      if (!result) {
        throw new LangfuseNotFoundError("Dataset run not found");
      }

      return {
        ...transformDbDatasetRunToAPIDatasetRun(result.run),
        datasetRunItems: result.datasetRunItems,
      };
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset-run-by-id",
    querySchema: DeleteDatasetRunV2ByIdQuery,
    responseSchema: DeleteDatasetRunV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const deleted = await deleteDatasetRunByIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        runId: query.runId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      if (!deleted) {
        throw new LangfuseNotFoundError("Dataset run not found");
      }

      return {
        message: "Dataset run successfully deleted" as const,
      };
    },
  }),
});
