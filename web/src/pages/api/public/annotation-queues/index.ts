import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { logger } from "@langfuse/shared/src/server";

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
  POST: createAuthedProjectAPIRoute({
    name: "Create annotation queue",
    bodySchema: CreateAnnotationQueueBody,
    responseSchema: CreateAnnotationQueueResponse,
    fn: async ({ body, auth }) => {
            // Check if the queue exists
      const existingQueue = await prisma.annotationQueue.findFirst({
        where: {
          name: body.name,
          projectId: auth.scope.projectId,
        },
      });

      if (existingQueue) {
          throw new Error("Failed to create annotation queue, since the queue name already exists");
      }

      // check if score configs are valid
      const configs = await prisma.scoreConfig.findMany({
        where: {
          id: { in: body.scoreConfigIds },
          projectId: auth.scope.projectId,
        },
      });
      
      if (configs.length !== body.scoreConfigIds.length) {
        logger.warn("Failed to create annotation queue, and created the queue with only valid score configs");
      }

      const validScoreConfigIds = configs.map((config) => config.id);
      if (validScoreConfigIds.length === 0) {
        throw new Error("Failed to create annotation queue, since no valid score configs were found");
      }


      const queue = await prisma.annotationQueue.create({
          data: {
              projectId: auth.scope.projectId,
              name: body.name,
              description: body.description,
              scoreConfigIds: validScoreConfigIds,
          },
      });

      return {
          id: queue.id,
      };
    },
  }),
});
