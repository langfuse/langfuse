import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { v4 as uuidv4 } from "uuid";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
  transformDbDatasetItemToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { type DatasetItem, LangfuseNotFoundError } from "@langfuse/shared";

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

      // SQL injection is handled by Prisma's $queryRaw tagged template literal
      // Values are automatically escaped and parameterized by Prisma
      // The template literal syntax ${value} safely interpolates values
      const items = await prisma.$queryRaw<Array<DatasetItem>>`
        INSERT INTO "public"."dataset_items" (
          "id",
          "project_id", 
          "status",
          "input",
          "expected_output",
          "dataset_id",
          "created_at",
          "updated_at",
          "metadata",
          "source_trace_id",
          "source_observation_id"
        )
        VALUES (
          ${itemId},
          ${auth.scope.projectId},
          ${status ?? null}::public."DatasetStatus",
          ${input ?? null},
          ${expectedOutput ?? null}, 
          ${dataset.id},
          NOW(),
          NOW(),
          ${metadata ?? null},
          ${sourceTraceId ?? null},
          ${sourceObservationId ?? null}
        )
        ON CONFLICT ("id", "project_id", "dataset_id")
        DO UPDATE SET
          "input" = ${input ?? null},
          "expected_output" = ${expectedOutput ?? null},
          "metadata" = ${metadata ?? null},
          "source_trace_id" = ${sourceTraceId ?? null},
          "source_observation_id" = ${sourceObservationId ?? null},
          "status" = ${status ?? null}::public."DatasetStatus",
          "updated_at" = NOW()
        RETURNING *;
      `;

      if (items.length === 0) {
        throw new LangfuseNotFoundError("Dataset item not found");
      }

      return transformDbDatasetItemToAPIDatasetItem({
        ...items[0],
        datasetName: dataset.name,
      });
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
