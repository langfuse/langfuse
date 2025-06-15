import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetsV2Query,
  GetDatasetsV2Response,
  PostDatasetsV2Body,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset",
    bodySchema: PostDatasetsV2Body,
    responseSchema: PostDatasetsV2Response,
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

      await auditLog({
        action: "create",
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: dataset,
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
          projectId: true,
          createdAt: true,
          updatedAt: true,
          id: true,
        },
        where: {
          projectId: auth.scope.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
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
