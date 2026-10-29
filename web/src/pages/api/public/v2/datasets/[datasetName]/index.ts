import { prisma } from "@langfuse/shared/src/db";
import {
  DeleteDatasetV2Query,
  DeleteDatasetV2Response,
  GetDatasetV2Query,
  GetDatasetV2Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { deleteDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset",
    action: "datasets:read",
    querySchema: GetDatasetV2Query,
    responseSchema: GetDatasetV2Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { datasetName } = query;

      const dataset = await prisma.dataset.findFirst({
        where: {
          name: datasetName,
          projectId: auth.scope.projectId,
        },
      });

      if (!dataset) {
        throw new LangfuseNotFoundError("Dataset not found");
      }
      return transformDbDatasetToAPIDataset(dataset);
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset",
    action: "datasets:CUD",
    querySchema: DeleteDatasetV2Query,
    responseSchema: DeleteDatasetV2Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await deleteDatasetForApi({
        datasetName: query.datasetName,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      }),
  }),
});
