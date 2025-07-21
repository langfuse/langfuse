import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  type APIDatasetRunItem,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
  transformDbDatasetRunItemToAPIDatasetRunItemPg,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import {
  eventTypes,
  logger,
  processEventBatch,
  createOrFetchDatasetRun,
  executeWithDatasetRunItemsStrategy,
  DatasetRunItemsOperationType,
} from "@langfuse/shared/src/server";
import { validateCreateDatasetRunItemBodyAndFetch } from "@/src/features/public-api/server/dataset-run-items";
import { v4 } from "uuid";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth, res }) => {
      return await executeWithDatasetRunItemsStrategy({
        input: body,
        operationType: DatasetRunItemsOperationType.WRITE,
        postgresExecution: async (bodyInput: typeof body) => {
          /**************
           * VALIDATION *
           **************/

          const result = await validateCreateDatasetRunItemBodyAndFetch(
            bodyInput,
            auth.scope.projectId,
          );

          if (!result.success) {
            throw new LangfuseNotFoundError(result.error);
          }

          /********************
           *   RUN CREATION    *
           ********************/

          const { datasetItem, traceId, observationId } = result;

          const run = await createOrFetchDatasetRun({
            name: bodyInput.runName,
            description: bodyInput.runDescription ?? undefined,
            metadata: bodyInput.metadata ?? undefined,
            projectId: auth.scope.projectId,
            datasetId: datasetItem.datasetId,
          });

          /********************
           * RUN ITEM CREATION *
           ********************/

          const runItem = await prisma.datasetRunItems.create({
            data: {
              datasetItemId: datasetItem.id,
              traceId,
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
            datasetItemId: datasetItem.id,
            traceId,
            observationId: observationId ?? undefined,
          });

          return transformDbDatasetRunItemToAPIDatasetRunItemPg({
            ...runItem,
            datasetRunName: run.name,
          });
        },
        clickhouseExecution: async (bodyInput: typeof body) => {
          /**************
           * VALIDATION *
           **************/

          const result = await validateCreateDatasetRunItemBodyAndFetch(
            bodyInput,
            auth.scope.projectId,
          );

          if (!result.success) {
            throw new LangfuseNotFoundError(result.error);
          }

          const { datasetItem, traceId, observationId } = result;

          /********************
           *   RUN CREATION    *
           ********************/

          const run = await createOrFetchDatasetRun({
            name: bodyInput.runName,
            description: bodyInput.runDescription ?? undefined,
            metadata: bodyInput.metadata ?? undefined,
            projectId: auth.scope.projectId,
            datasetId: datasetItem.datasetId,
          });

          /********************
           * RUN ITEM CREATION *
           ********************/

          const createdAt = new Date();

          const event = {
            id: v4(),
            type: eventTypes.DATASET_RUN_ITEM_CREATE,
            timestamp: new Date().toISOString(),
            body: {
              id: v4(),
              traceId: traceId,
              observationId: observationId,
              error: null,
              input: datasetItem.input,
              expectedOutput: datasetItem.expectedOutput,
              createdAt: createdAt.toISOString(),
              datasetId: datasetItem.datasetId,
              datasetRunId: run.id,
              datasetItemId: datasetItem.id,
            },
          };
          // note: currently we do not accept user defined ids for dataset run items
          const ingestionResult = await processEventBatch([event], auth);
          if (ingestionResult.errors.length > 0) {
            const error = ingestionResult.errors[0];
            res
              .status(error.status)
              .json({ message: error.error ?? error.message });
            // TODO: figure out dummy return
          }
          if (ingestionResult.successes.length !== 1) {
            logger.error("Failed to create dataset run item", { result });
            throw new Error("Failed to create dataset run item");
          }

          /********************
           * ASYNC RUN ITEM EVAL *
           ********************/

          await addDatasetRunItemsToEvalQueue({
            projectId: auth.scope.projectId,
            datasetItemId: datasetItem.id,
            traceId,
            observationId: observationId ?? undefined,
          });

          const mockDatasetRunItem: APIDatasetRunItem = {
            id: event.body.id,
            datasetRunId: run.id,
            datasetRunName: run.name,
            datasetItemId: datasetItem.id,
            traceId: traceId,
            observationId: observationId,
            createdAt: createdAt,
            updatedAt: createdAt,
          };

          return mockDatasetRunItem;
        },
      });
    },
  }),
});
