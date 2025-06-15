import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetsV1Query,
  GetDatasetsV1Response,
  PostDatasetsV1Body,
  PostDatasetsV1Response,
} from "@/src/features/public-api/types/datasets";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create or Update Dataset",
    bodySchema: PostDatasetsV1Body,
    responseSchema: PostDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const { name, description, metadata } = body;

      const dataset = await prisma.dataset.upsert({
        where: {
          projectId_name: {
            projectId: auth.scope.projectId,
            name,
          },
        },
        create: {
          name,
          description: description ?? undefined,
          projectId: auth.scope.projectId,
          metadata: metadata ?? undefined,
        },
        update: {
          description: description ?? null,
          metadata: metadata ?? undefined,
        },
      });

      return {
        ...dataset,
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
          projectId: true,
          createdAt: true,
          updatedAt: true,
          id: true,
          datasetItems: {
            where: {
              status: "ACTIVE",
            },
            select: {
              id: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
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

      const totalItems = await prisma.dataset.count({
        where: {
          projectId: auth.scope.projectId,
        },
      });

      return {
        data: datasets.map(({ datasetItems, datasetRuns, ...rest }) => ({
          ...rest,
          items: datasetItems.map(({ id }) => id),
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
