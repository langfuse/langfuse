import { v4 } from "uuid";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  eventTypes,
  getDatasetItemById,
  getObservationById,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import { createOrFetchDatasetRun } from "@/src/features/public-api/server/dataset-runs";
import {
  type APIDatasetRunItem,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";
import { resolveMetadata } from "../schema";

export const [createDatasetRunItemTool, handleCreateDatasetRunItem] =
  defineTool({
    name: "createDatasetRunItem",
    description:
      "Create a dataset run item, a result that links one dataset item to a trace or observation in a dataset run.",
    baseSchema: PostDatasetRunItemsV1Body,
    inputSchema: PostDatasetRunItemsV1Body,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dataset_run_items.create",
        context,
        attributes: {
          "mcp.dataset_item_id": input.datasetItemId,
          "mcp.dataset_run_name": input.runName,
        },
        fn: async () => {
          const datasetItem = await getDatasetItemById({
            projectId: context.projectId,
            datasetItemId: input.datasetItemId,
            status: "ACTIVE",
            version: input.datasetVersion ?? undefined,
          });

          if (!datasetItem) {
            throw new LangfuseNotFoundError("Dataset item not found");
          }

          let finalTraceId = input.traceId;
          if (!input.traceId && input.observationId) {
            const observation = await getObservationById({
              id: input.observationId,
              projectId: context.projectId,
              fetchWithInputOutput: false,
            });
            if (!observation) {
              throw new LangfuseNotFoundError("Observation not found");
            }
            finalTraceId = observation.traceId;
          }

          if (!finalTraceId) {
            throw new LangfuseNotFoundError("Trace not found");
          }

          const metadata = {
            ...(input.metadata ? resolveMetadata(input.metadata) : {}),
            ...(input.datasetVersion
              ? { dataset_version: input.datasetVersion.toISOString() }
              : {}),
          };
          const createdAt = input.createdAt
            ? new Date(input.createdAt)
            : new Date();

          const run = await createOrFetchDatasetRun({
            name: input.runName,
            description: input.runDescription ?? undefined,
            metadata,
            projectId: context.projectId,
            datasetId: datasetItem.datasetId,
            createdAt,
          });

          const runItemId = v4();
          const event = {
            id: runItemId,
            type: eventTypes.DATASET_RUN_ITEM_CREATE,
            timestamp: new Date().toISOString(),
            body: {
              id: runItemId,
              traceId: finalTraceId,
              observationId: input.observationId ?? undefined,
              error: null,
              createdAt: createdAt.toISOString(),
              datasetId: datasetItem.datasetId,
              runId: run.id,
              datasetItemId: datasetItem.id,
              datasetVersion: datasetItem.validFrom.toISOString(),
            },
          };

          const auth = await getMcpPublicApiAuth(context);
          const ingestionResult = await processEventBatch([event], auth, {
            isLangfuseInternal: true,
          });

          if (ingestionResult.errors.length > 0) {
            const error = ingestionResult.errors[0];
            throw new Error(error.error ?? error.message);
          }
          if (ingestionResult.successes.length !== 1) {
            logger.error("Failed to create dataset run item", {
              result: ingestionResult,
            });
            throw new Error("Failed to create dataset run item");
          }

          await addDatasetRunItemsToEvalQueue({
            projectId: context.projectId,
            datasetItemId: datasetItem.id,
            datasetItemValidFrom: datasetItem.validFrom,
            traceId: finalTraceId,
            observationId: input.observationId ?? undefined,
          });

          const mockDatasetRunItem: APIDatasetRunItem = {
            id: event.body.id,
            datasetRunId: run.id,
            datasetRunName: run.name,
            datasetItemId: datasetItem.id,
            traceId: finalTraceId,
            observationId: input.observationId ?? null,
            createdAt,
            updatedAt: createdAt,
          };

          return PostDatasetRunItemsV1Response.parse(mockDatasetRunItem);
        },
      }),
  });
