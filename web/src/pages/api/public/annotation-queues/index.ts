import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/features/public-api/types/annotation-queues";

export default withMiddlewares({
  // NOTE: Post API requires entitlement check
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queues",
    querySchema: GetAnnotationQueuesQuery,
    responseSchema: GetAnnotationQueuesResponse,
    fn: async ({ query, auth }) => {
      const [queues, totalItems] = await Promise.all([
        prisma.annotationQueue.findMany({
          where: {
            projectId: auth.scope.projectId,
          },
          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        }),
        prisma.annotationQueue.count({
          where: {
            projectId: auth.scope.projectId,
          },
        }),
      ]);

      return {
        data: queues.map((queue) => ({
          id: queue.id,
          name: queue.name,
          description: queue.description,
          scoreConfigIds: queue.scoreConfigIds,
          createdAt: queue.createdAt,
          updatedAt: queue.updatedAt,
        })),
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
