import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { v4 as uuidv4 } from "uuid";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Dataset Item",
    bodySchema: PostDatasetItemsV1Body,
    responseSchema: PostDatasetItemsV1Response,
    fn: async ({ body, auth }) => {
      const {
        datasetName,
        id,
        input,
        expectedOutput,
        metadata,
        sourceTraceId,
        sourceObservationId,
        status,
      } = body;

      const dataset = await prisma.dataset.findFirst({
        where: {
          projectId: auth.scope.projectId,
          name: datasetName,
        },
      });
      if (!dataset) {
        throw new LangfuseNotFoundError("Dataset not found");
      }

      const itemId = id ?? uuidv4();

      const item = await prisma.datasetItem.upsert({
        where: {
          id: itemId,
          datasetId: dataset.id,
        },
        create: {
          id: itemId,
          input: input ?? undefined,
          expectedOutput: expectedOutput ?? undefined,
          datasetId: dataset.id,
          metadata: metadata ?? undefined,
          sourceTraceId: sourceTraceId ?? undefined,
          sourceObservationId: sourceObservationId ?? undefined,
          status: status ?? undefined,
        },
        update: {
          input: input ?? undefined,
          expectedOutput: expectedOutput ?? undefined,
          metadata: metadata ?? undefined,
          sourceTraceId: sourceTraceId ?? undefined,
          sourceObservationId: sourceObservationId ?? undefined,
          status: status ?? undefined,
        },
      });

      return {
        ...item,
        datasetName: dataset.name,
      };
    },
  }),
  GET: createAuthedAPIRoute({
    name: "Get Dataset Items",
    querySchema: GetDatasetItemsV1Query,
    responseSchema: GetDatasetItemsV1Response,
    fn: async ({ query, auth }) => {
      const { datasetName, sourceTraceId, sourceObservationId, page, limit } =
        query;

      let datasetId: string | undefined = undefined;
      if (datasetName) {
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: datasetName,
            projectId: auth.scope.projectId,
          },
        });
        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }
        datasetId = dataset.id;
      }

      const items = (
        await prisma.datasetItem.findMany({
          where: {
            dataset: {
              projectId: auth.scope.projectId,
              ...(datasetId ? { id: datasetId } : {}),
            },
            sourceTraceId: sourceTraceId ?? undefined,
            sourceObservationId: sourceObservationId ?? undefined,
          },
          take: limit,
          skip: (page - 1) * limit,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        })
      ).map(({ dataset, ...other }) => ({
        ...other,
        datasetName: dataset.name,
      }));

      const totalItems = await prisma.datasetItem.count({
        where: {
          dataset: {
            projectId: auth.scope.projectId,
            ...(datasetId ? { id: datasetId } : {}),
          },
          sourceTraceId: sourceTraceId ?? undefined,
          sourceObservationId: sourceObservationId ?? undefined,
        },
      });

      return {
        data: items,
        meta: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    },
  }),
});
