import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  type APIDatasetRunItem,
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { type JSONValue, LangfuseNotFoundError } from "@langfuse/shared";
import { addDatasetRunItemsToEvalQueue } from "@/src/features/evals/server/addDatasetRunItemsToEvalQueue";
import {
  eventTypes,
  logger,
  processEventBatch,
  getObservationById,
  getDatasetItemById,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { createOrFetchDatasetRun } from "@/src/features/public-api/server/dataset-runs";
import {
  generateDatasetRunItemsForPublicApi,
  getDatasetRunItemsCountForPublicApi,
} from "@/src/features/public-api/server/dataset-run-items";

const resolveMetadata = (metadata: JSONValue): Record<string, unknown> => {
  if (Array.isArray(metadata)) {
    return { metadata: metadata };
  }
  if (typeof metadata === "object" && metadata !== null) {
    return metadata as Record<string, unknown>;
  }
  return { metadata: metadata };
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth, res }) => {
      /**************
       * VALIDATION *
       **************/
      const { traceId, observationId, datasetItemId } = body;

      const datasetItem = await getDatasetItemById({
        projectId: auth.scope.projectId,
        datasetItemId: datasetItemId,
        status: "ACTIVE",
        version: body.datasetVersion ?? undefined,
      });

      if (!datasetItem) {
        throw new LangfuseNotFoundError("Dataset item not found");
      }

      let finalTraceId = traceId;

      // Backwards compatibility: historically, dataset run items were linked to observations, not traces
      if (!traceId && observationId) {
        const observation = await getObservationById({
          id: observationId,
          projectId: auth.scope.projectId,
          fetchWithInputOutput: false,
        });
        if (observationId && !observation) {
          throw new LangfuseNotFoundError("Observation not found");
        }
        finalTraceId = observation?.traceId;
      }

      if (!finalTraceId) {
        throw new LangfuseNotFoundError("Trace not found");
      }

      /********************
       *   RUN CREATION    *
       ********************/

      const metadata = {
        ...(body.metadata ? resolveMetadata(body.metadata) : {}),
        ...(body.datasetVersion
          ? {
              dataset_version: body.datasetVersion.toISOString(),
            }
          : {}),
      };

      const run = await createOrFetchDatasetRun({
        name: body.runName,
        description: body.runDescription ?? undefined,
        metadata: metadata,
        projectId: auth.scope.projectId,
        datasetId: datasetItem.datasetId,
      });

      const runItemId = v4();

      /********************
       * RUN ITEM CREATION *
       ********************/

      const createdAt = new Date();

      const event = {
        id: runItemId,
        type: eventTypes.DATASET_RUN_ITEM_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          id: runItemId,
          traceId: finalTraceId,
          observationId: observationId ?? undefined,
          error: null,
          createdAt: createdAt.toISOString(),
          datasetId: datasetItem.datasetId,
          runId: run.id,
          datasetItemId: datasetItem.id,
          datasetVersion: datasetItem.validFrom.toISOString(),
        },
      };
      // note: currently we do not accept user defined ids for dataset run items
      const ingestionResult = await processEventBatch([event], auth, {
        isLangfuseInternal: true,
      });
      if (ingestionResult.errors.length > 0) {
        const error = ingestionResult.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        // We will still return the mock dataset run item in the response for now. Logs are to be monitored.
      }
      if (ingestionResult.successes.length !== 1) {
        logger.error("Failed to create dataset run item", {
          result: ingestionResult,
        });
        throw new Error("Failed to create dataset run item");
      }

      /********************
       * ASYNC RUN ITEM EVAL *
       ********************/

      await addDatasetRunItemsToEvalQueue({
        projectId: auth.scope.projectId,
        datasetItemId: datasetItem.id,
        datasetItemValidFrom: datasetItem.validFrom,
        traceId: finalTraceId,
        observationId: observationId ?? undefined,
      });

      const mockDatasetRunItem: APIDatasetRunItem = {
        id: event.body.id,
        datasetRunId: run.id,
        datasetRunName: run.name,
        datasetItemId: datasetItem.id,
        traceId: finalTraceId,
        observationId: observationId ?? null,
        createdAt: createdAt,
        updatedAt: createdAt,
      };

      return mockDatasetRunItem;
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Run Items",
    querySchema: GetDatasetRunItemsV1Query,
    responseSchema: GetDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      /**************
       * VALIDATION *
       **************/

      const datasetRun = await prisma.datasetRuns.findUnique({
        where: {
          datasetId_projectId_name: {
            datasetId: query.datasetId,
            name: query.runName,
            projectId: auth.scope.projectId,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!datasetRun) {
        throw new LangfuseNotFoundError(
          "Dataset run not found for the given project and dataset id",
        );
      }

      const { datasetId, limit, page } = query;
      /**************
       * RESPONSE *
       **************/

      const [items, count] = await Promise.all([
        generateDatasetRunItemsForPublicApi({
          props: {
            datasetId,
            runId: datasetRun.id,
            projectId: auth.scope.projectId,
            limit,
            page,
          },
        }),
        getDatasetRunItemsCountForPublicApi({
          props: {
            datasetId,
            runId: datasetRun.id,
            projectId: auth.scope.projectId,
            limit,
            page,
          },
        }),
      ]);

      const finalCount = count || 0;
      return {
        data: items,
        meta: {
          page,
          limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / limit),
        },
      };
    },
  }),
});
