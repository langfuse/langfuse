import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
  DeleteDatasetItemV1Query,
  DeleteDatasetItemV1Response,
  transformDbDatasetItemToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { deleteDatasetItem } from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Item",
    querySchema: GetDatasetItemV1Query,
    responseSchema: GetDatasetItemV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { datasetItemId } = query;

      const datasetItem = await prisma.datasetItem.findUnique({
        where: {
          id_projectId: {
            projectId: auth.scope.projectId,
            id: datasetItemId,
          },
        },
        include: {
          dataset: {
            select: {
              name: true,
            },
          },
        },
      });
      if (!datasetItem) {
        throw new LangfuseNotFoundError("Dataset item not found");
      }

      const { dataset, ...datasetItemBody } = datasetItem;

      return transformDbDatasetItemToAPIDatasetItem({
        ...datasetItemBody,
        status: datasetItemBody.status ?? "ACTIVE",
        datasetName: dataset.name,
      });
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Dataset Item",
    querySchema: DeleteDatasetItemV1Query,
    responseSchema: DeleteDatasetItemV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { datasetItemId } = query;

      const result = await deleteDatasetItem({
        projectId: auth.scope.projectId,
        datasetItemId: datasetItemId,
      });

      await auditLog({
        action: "delete",
        resourceType: "datasetItem",
        resourceId: datasetItemId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before: result.deletedItem,
      });

      return {
        message: "Dataset item successfully deleted" as const,
      };
    },
  }),
});
