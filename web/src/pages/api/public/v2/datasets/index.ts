import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetsV2Query,
  GetDatasetsV2Response,
  PostDatasetsV2Body,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { createDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset",
    bodySchema: PostDatasetsV2Body,
    responseSchema: PostDatasetsV2Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const dataset = await createDatasetForApi({
        input: body,
        projectId: auth.scope.projectId,
        auditScope: auth.scope,
      });

      return dataset;
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Datasets",
    querySchema: GetDatasetsV2Query,
    responseSchema: GetDatasetsV2Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
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
        },
        where: {
          projectId: auth.scope.projectId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      });

      const totalItems = await prisma.dataset.count({
        where: {
          projectId: auth.scope.projectId,
        },
      });

      return {
        data: datasets,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
});
