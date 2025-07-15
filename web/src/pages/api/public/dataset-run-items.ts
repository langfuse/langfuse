import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
  transformDbDatasetRunItemToAPIDatasetRunItemPg,
} from "@/src/features/public-api/types/datasets";
import {
  LangfuseNotFoundError,
  InvalidRequestError,
  executeWithDatasetRunItemsStrategy,
  DatasetRunItemsOperationType,
} from "@langfuse/shared";
import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import {
  getObservationById,
  validateDatasetRunAndFetch,
} from "@langfuse/shared/src/server";
import {
  generateDatasetRunItemsForPublicApi,
  getDatasetRunItemsCountForPublicApi,
} from "@/src/features/public-api/server/dataset-run-items";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const res = await executeWithDatasetRunItemsStrategy({
        input: body,
        operationType: DatasetRunItemsOperationType.WRITE,
        postgresExecution: async (bodyInput: typeof body) => {
          const {
            datasetItemId,
            observationId,
            traceId,
            runName,
            runDescription,
            metadata,
          } = bodyInput;

          /**************
           * VALIDATION *
           **************/

          const datasetItem = await prisma.datasetItem.findUnique({
            where: {
              id_projectId: {
                projectId: auth.scope.projectId,
                id: datasetItemId,
              },
              status: "ACTIVE",
            },
            include: {
              dataset: true,
            },
          });

          if (!datasetItem) {
            throw new LangfuseNotFoundError(
              "Dataset item not found or not active",
            );
          }

          let finalTraceId = traceId;

          // Backwards compatibility: historically, dataset run items were linked to observations, not traces
          if (!traceId && observationId) {
            const observation = await getObservationById({
              id: observationId,
              projectId: auth.scope.projectId,
              fetchWithInputOutput: true,
            });
            if (observationId && !observation) {
              throw new LangfuseNotFoundError("Observation not found");
            }
            finalTraceId = observation?.traceId;
          }

          if (!finalTraceId) {
            throw new InvalidRequestError("No traceId set");
          }

          /********************
           * RUN ITEM CREATION *
           ********************/

          const run = await prisma.datasetRuns.upsert({
            where: {
              datasetId_projectId_name: {
                datasetId: datasetItem.datasetId,
                name: runName,
                projectId: auth.scope.projectId,
              },
            },
            create: {
              name: runName,
              description: runDescription ?? undefined,
              datasetId: datasetItem.datasetId,
              metadata: metadata ?? undefined,
              projectId: auth.scope.projectId,
            },
            update: {
              metadata: metadata ?? undefined,
              description: runDescription ?? undefined,
            },
          });

          const runItem = await prisma.datasetRunItems.create({
            data: {
              datasetItemId,
              traceId: finalTraceId,
              observationId,
              datasetRunId: run.id,
              projectId: auth.scope.projectId,
            },
          });

          /********************
           * ASYNC RUN ITEM EVAL *
           ********************/

          await addDatasetRunItemsToEvalQueue({
            projectId: auth.scope.projectId,
            datasetItemId,
            traceId: finalTraceId,
            observationId: observationId ?? undefined,
          });

          return transformDbDatasetRunItemToAPIDatasetRunItemPg({
            ...runItem,
            datasetRunName: run.name,
          });
        },
        clickhouseExecution: async (bodyInput: typeof body) => {
          return {};
        },
      });

      return res;
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Run Items",
    querySchema: GetDatasetRunItemsV1Query,
    responseSchema: GetDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const res = await executeWithDatasetRunItemsStrategy({
        input: query,
        operationType: DatasetRunItemsOperationType.READ,
        postgresExecution: async (queryInput: typeof query) => {
          const { datasetId, runName, ...pagination } = queryInput;

          /**************
           * VALIDATION *
           **************/

          const res = await validateDatasetRunAndFetch(
            datasetId,
            runName,
            auth.scope.projectId,
          );

          if (!res.success) {
            throw new LangfuseNotFoundError(res.error);
          }

          const datasetRunItems = await prisma.datasetRunItems.findMany({
            where: {
              datasetRunId: res.datasetRun.id,
              projectId: auth.scope.projectId,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: pagination.limit,
            skip: (pagination.page - 1) * pagination.limit,
          });

          const totalItems = await prisma.datasetRunItems.count({
            where: {
              datasetRunId: res.datasetRun.id,
              projectId: auth.scope.projectId,
            },
          });

          /**************
           * RESPONSE *
           **************/

          return {
            data: datasetRunItems.map((runItem) =>
              transformDbDatasetRunItemToAPIDatasetRunItemPg({
                ...runItem,
                datasetRunName: queryInput.runName,
              }),
            ),
            meta: {
              page: pagination.page,
              limit: pagination.limit,
              totalItems,
              totalPages: Math.ceil(totalItems / pagination.limit),
            },
          };
        },
        clickhouseExecution: async (queryInput: typeof query) => {
          const { datasetId, runName, ...pagination } = queryInput;

          /**************
           * VALIDATION *
           **************/

          const res = await validateDatasetRunAndFetch(
            datasetId,
            runName,
            auth.scope.projectId,
          );

          if (!res.success) {
            throw new LangfuseNotFoundError(res.error);
          }

          /**************
           * RESPONSE *
           **************/

          const [items, count] = await Promise.all([
            generateDatasetRunItemsForPublicApi({
              props: {
                datasetId,
                runName,
                projectId: auth.scope.projectId,
                ...pagination,
              },
            }),
            getDatasetRunItemsCountForPublicApi({
              props: {
                datasetId,
                runName,
                projectId: auth.scope.projectId,
                ...pagination,
              },
            }),
          ]);

          const finalCount = count || 0;
          return {
            data: items,
            meta: {
              page: pagination.page,
              limit: pagination.limit,
              totalItems: finalCount,
              totalPages: Math.ceil(finalCount / pagination.limit),
            },
          };
        },
      });

      return res;
    },
  }),
});
