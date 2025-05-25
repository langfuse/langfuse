import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { v4 as uuidv4 } from "uuid";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
  transformDbDatasetItemToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import {
  type DatasetItem,
  LangfuseNotFoundError,
  Prisma,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Item",
    bodySchema: PostDatasetItemsV1Body,
    responseSchema: PostDatasetItemsV1Response,
    rateLimitResource: "datasets",
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

      let item: DatasetItem;
      try {
        item = await prisma.datasetItem.upsert({
          where: {
            datasetId: dataset.id,
            id_projectId: {
              projectId: auth.scope.projectId,
              id: itemId,
            },
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
            projectId: auth.scope.projectId,
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
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        ) {
          // this case happens when a dataset item was created for a different dataset.
          // In the database, the uniqueness constraint is on (id, projectId) only.
          // When this constraint is violated, the database will upsert based on (id, projectId, datasetId).
          // If this record does not exist, the database will throw an error.
          logger.warn(
            `Failed to upsert dataset item. Dataset item ${itemId} in project ${auth.scope.projectId} already exists for a different dataset than ${dataset.id}`,
          );
          throw new LangfuseNotFoundError(
            `The dataset item with id ${itemId} already exists in a dataset other than ${dataset.name}`,
          );
        }
        throw e;
      }

      await auditLog({
        action: "create",
        resourceType: "datasetItem",
        resourceId: item.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: item,
      });

      return transformDbDatasetItemToAPIDatasetItem({
        ...item,
        datasetName: dataset.name,
      });
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Items",
    querySchema: GetDatasetItemsV1Query,
    responseSchema: GetDatasetItemsV1Response,
    rateLimitResource: "datasets",
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
            projectId: auth.scope.projectId,
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
        data: items.map(transformDbDatasetItemToAPIDatasetItem),
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
