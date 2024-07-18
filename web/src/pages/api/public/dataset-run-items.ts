import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
  transformDbDatasetRunItemToAPIDatasetRunItem,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError, InvalidRequestError } from "@langfuse/shared";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    fn: async ({ body, auth }) => {
      const {
        datasetItemId,
        observationId,
        traceId,
        runName,
        runDescription,
        metadata,
      } = body;

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
        throw new LangfuseNotFoundError("Dataset item not found or not active");
      }

      let finalTraceId = traceId;

      // Backwards compatibility: historically, dataset run items were linked to observations, not traces
      if (!traceId && observationId) {
        const observation = observationId
          ? await prisma.observation.findUnique({
              where: {
                id: observationId,
                projectId: auth.scope.projectId,
              },
            })
          : undefined;
        if (observationId && !observation) {
          throw new LangfuseNotFoundError("Observation not found");
        }
        finalTraceId = observation?.traceId;
      }

      if (!finalTraceId) {
        throw new InvalidRequestError("No traceId set");
      }

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
          datasetItemId: datasetItemId,
          traceId: finalTraceId,
          observationId,
          datasetRunId: run.id,
          projectId: auth.scope.projectId,
        },
      });

      return transformDbDatasetRunItemToAPIDatasetRunItem({
        ...runItem,
        datasetRunName: run.name,
      });
    },
  }),
});
