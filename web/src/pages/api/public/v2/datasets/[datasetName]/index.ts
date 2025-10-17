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
import { addToDeleteDatasetQueue } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset",
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
    querySchema: DeleteDatasetV2Query,
    responseSchema: DeleteDatasetV2Response,
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

      await prisma.dataset.delete({
        where: {
          projectId_name: {
            projectId: auth.scope.projectId,
            name: datasetName,
          },
        },
      });

      await auditLog({
        action: "delete",
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before: dataset,
      });

      await addToDeleteDatasetQueue({
        deletionType: "dataset",
        projectId: auth.scope.projectId,
        datasetId: dataset.id,
      });

      return {
        message: "Dataset successfully deleted" as const,
      };
    },
  }),
});
