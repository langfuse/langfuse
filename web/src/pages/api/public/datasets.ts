import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetsV1Query,
  GetDatasetsV1Response,
  PostDatasetsV1Body,
  PostDatasetsV1Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { upsertDataset } from "@/src/features/datasets/server/actions/createDataset";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  createDatasetItemFilterState,
  getDatasetItems,
} from "@langfuse/shared/src/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create or Update Dataset",
    bodySchema: PostDatasetsV1Body,
    responseSchema: PostDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const { name, description, metadata, inputSchema, expectedOutputSchema } =
        body;

      const dataset = await upsertDataset({
        input: {
          name,
          description: description ?? undefined,
          metadata: metadata ?? undefined,
          inputSchema,
          expectedOutputSchema,
        },
        projectId: auth.scope.projectId,
      });

      await auditLog({
        action: "create",
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: dataset,
      });

      return {
        ...transformDbDatasetToAPIDataset(dataset),
        items: [],
        runs: [],
      };
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Datasets",
    querySchema: GetDatasetsV1Query,
    responseSchema: GetDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { limit, page } = query;

      const datasets = await prisma.dataset.findMany({
        select: {
          name: true,
          description: true,
          metadata: true,
          inputSchema: true,
          expectedOutputSchema: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
          id: true,
          datasetRuns: {
            select: {
              name: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          projectId: auth.scope.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      const datasetItems = await getDatasetItems({
        projectId: auth.scope.projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: datasets.map(({ id }) => id),
          status: "ACTIVE",
        }),
        includeIO: false,
      });

      // create Map of dataset id to dataset item ids
      const datasetItemIdsMap = new Map<string, string[]>();
      for (const item of datasetItems) {
        datasetItemIdsMap.set(item.datasetId, [
          ...(datasetItemIdsMap.get(item.datasetId) || []),
          item.id,
        ]);
      }

      const totalItems = await prisma.dataset.count({
        where: {
          projectId: auth.scope.projectId,
        },
      });

      return {
        data: datasets.map(({ datasetRuns, ...rest }) => ({
          ...rest,
          items: datasetItemIdsMap.get(rest.id) || [],
          runs: datasetRuns.map(({ name }) => name),
        })),
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
