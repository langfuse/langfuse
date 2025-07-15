import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetRunV1Query,
  GetDatasetRunV1Response,
  DeleteDatasetRunV1Query,
  DeleteDatasetRunV1Response,
  transformDbDatasetRunItemToAPIDatasetRunItemPg,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  ApiError,
  DatasetRunItemsOperationType,
  executeWithDatasetRunItemsStrategy,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DatasetRunItemsDeleteQueue,
  validateDatasetRunAndFetch,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { generateDatasetRunItemsForPublicApi } from "@/src/features/public-api/server/dataset-run-items";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-run",
    querySchema: GetDatasetRunV1Query,
    responseSchema: GetDatasetRunV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const res = await executeWithDatasetRunItemsStrategy({
        input: query,
        operationType: DatasetRunItemsOperationType.READ,
        postgresExecution: async (queryInput: typeof query) => {
          const datasetRuns = await prisma.datasetRuns.findMany({
            where: {
              projectId: auth.scope.projectId,
              name: queryInput.runName,
              dataset: {
                name: queryInput.name,
                projectId: auth.scope.projectId,
              },
            },
            include: {
              datasetRunItems: true,
              dataset: {
                select: {
                  name: true,
                },
              },
            },
          });

          if (datasetRuns.length > 1)
            throw new ApiError(
              "Found more than one dataset run with this name",
            );
          if (!datasetRuns[0])
            throw new LangfuseNotFoundError("Dataset run not found");

          const { dataset, datasetRunItems, ...run } = datasetRuns[0];

          return {
            ...transformDbDatasetRunToAPIDatasetRun({
              ...run,
              datasetName: dataset.name,
            }),
            datasetRunItems: datasetRunItems
              .map((item) => ({
                ...item,
                datasetRunName: run.name,
              }))
              .map(transformDbDatasetRunItemToAPIDatasetRunItemPg),
          };
        },
        clickhouseExecution: async (queryInput: typeof query) => {
          const datasetRuns = await prisma.datasetRuns.findMany({
            where: {
              projectId: auth.scope.projectId,
              name: queryInput.runName,
              dataset: {
                name: queryInput.name,
                projectId: auth.scope.projectId,
              },
            },
          });

          if (datasetRuns.length > 1)
            throw new ApiError(
              "Found more than one dataset run with this name",
            );
          if (!datasetRuns[0])
            throw new LangfuseNotFoundError("Dataset run not found");

          const run = datasetRuns[0];

          const datasetRunItems = await generateDatasetRunItemsForPublicApi({
            props: {
              datasetId: run.datasetId,
              runName: run.name,
              projectId: auth.scope.projectId,
            },
          });

          return {
            ...transformDbDatasetRunToAPIDatasetRun({
              ...run,
              datasetName: queryInput.name,
            }),
            datasetRunItems,
          };
        },
      });

      return res;
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "delete-dataset-run",
    querySchema: DeleteDatasetRunV1Query,
    responseSchema: DeleteDatasetRunV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const res = await executeWithDatasetRunItemsStrategy({
        input: query,
        operationType: DatasetRunItemsOperationType.WRITE,
        postgresExecution: async (queryInput: typeof query) => {
          // First get the dataset run to check if it exists
          const res = await validateDatasetRunAndFetch(
            queryInput.name,
            queryInput.runName,
            auth.scope.projectId,
          );

          if (!res.success) {
            throw new LangfuseNotFoundError(res.error);
          }

          // Delete the dataset run
          await prisma.datasetRuns.delete({
            where: {
              id_projectId: {
                projectId: auth.scope.projectId,
                id: res.datasetRun.id,
              },
            },
          });

          await auditLog({
            action: "delete",
            resourceType: "datasetRun",
            resourceId: res.datasetRun.id,
            projectId: auth.scope.projectId,
            orgId: auth.scope.orgId,
            apiKeyId: auth.scope.apiKeyId,
            before: res.datasetRun,
          });

          return {
            message: "Dataset run successfully deleted" as const,
          };
        },
        clickhouseExecution: async (queryInput: typeof query) => {
          const res = await validateDatasetRunAndFetch(
            queryInput.name,
            queryInput.runName,
            auth.scope.projectId,
          );

          if (!res.success) {
            throw new LangfuseNotFoundError(res.error);
          }

          // Delete the dataset run
          await prisma.datasetRuns.delete({
            where: {
              id_projectId: {
                projectId: auth.scope.projectId,
                id: res.datasetRun.id,
              },
            },
          });

          // Trigger async delete of dataset run items
          if (redis) {
            await DatasetRunItemsDeleteQueue.getInstance()?.add(
              QueueJobs.DatasetRunItemsDelete,
              {
                payload: {
                  projectId: auth.scope.projectId,
                  datasetRunId: res.datasetRun.id,
                  datasetId: res.datasetRun.datasetId,
                },
                id: randomUUID(),
                timestamp: new Date(),
                name: QueueJobs.DatasetRunItemsDelete as const,
              },
            );
          }

          await auditLog({
            action: "delete",
            resourceType: "datasetRun",
            resourceId: res.datasetRun.id,
            projectId: auth.scope.projectId,
            orgId: auth.scope.orgId,
            apiKeyId: auth.scope.apiKeyId,
            before: res.datasetRun,
          });

          return {
            message: "Dataset run successfully deleted" as const,
          };
        },
      });
      return res;
    },
  }),
});
