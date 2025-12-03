import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetRunV1Query,
  GetDatasetRunV1Response,
  DeleteDatasetRunV1Query,
  DeleteDatasetRunV1Response,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { ApiError, LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { addToDeleteDatasetQueue } from "@langfuse/shared/src/server";
import { generateDatasetRunItemsForPublicApi } from "@/src/features/public-api/server/dataset-run-items";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-run",
    querySchema: GetDatasetRunV1Query,
    responseSchema: GetDatasetRunV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const datasetRuns = await prisma.datasetRuns.findMany({
        where: {
          projectId: auth.scope.projectId,
          name: query.runName,
          dataset: {
            name: query.name,
            projectId: auth.scope.projectId,
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

      if (datasetRuns.length > 1)
        throw new ApiError("Found more than one dataset run with this name");
      if (!datasetRuns[0])
        throw new LangfuseNotFoundError("Dataset run not found");

      const { dataset, ...run } = datasetRuns[0];

      const datasetRunItems = await generateDatasetRunItemsForPublicApi({
        props: {
          datasetId: run.datasetId,
          runId: run.id,
          projectId: auth.scope.projectId,
        },
      });

      return {
        ...transformDbDatasetRunToAPIDatasetRun({
          ...run,
          datasetName: dataset.name,
        }),
        datasetRunItems,
      };
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset-run",
    querySchema: DeleteDatasetRunV1Query,
    responseSchema: DeleteDatasetRunV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      // First get the dataset run to check if it exists
      const datasetRuns = await prisma.datasetRuns.findMany({
        where: {
          projectId: auth.scope.projectId,
          name: query.runName,
          dataset: {
            name: query.name,
            projectId: auth.scope.projectId,
          },
        },
      });

      if (datasetRuns.length === 0) {
        throw new LangfuseNotFoundError("Dataset run not found");
      }
      if (datasetRuns.length > 1) {
        throw new ApiError(
          "Found more than one dataset run with this name and dataset",
        );
      }
      const datasetRun = datasetRuns[0];

      // Delete the dataset run
      await prisma.datasetRuns.delete({
        where: {
          id_projectId: {
            projectId: auth.scope.projectId,
            id: datasetRun.id,
          },
        },
      });

      await auditLog({
        action: "delete",
        resourceType: "datasetRun",
        resourceId: datasetRun.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before: datasetRun,
      });

      // Trigger async delete of dataset run items
      await addToDeleteDatasetQueue({
        deletionType: "dataset-runs",
        projectId: auth.scope.projectId,
        datasetRunIds: [datasetRun.id],
        datasetId: datasetRun.datasetId,
      });

      return {
        message: "Dataset run successfully deleted" as const,
      };
    },
  }),
});
