import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { InvalidRequestError, MethodNotAllowedError } from "@langfuse/shared";

export default withMiddlewares({
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
      // entitlement check
      if (auth.scope.plan === "cloud:hobby") {
        if (
          (await prisma.annotationQueue.count({
            where: {
              projectId: auth.scope.projectId,
            },
          })) >= 1
        ) {
          throw new MethodNotAllowedError(
            "Maximum number of annotation queues reached on Hobby plan.",
          );
        }
      }

      const existingQueue = await prisma.annotationQueue.findFirst({
        where: {
          projectId: auth.scope.projectId,
          name: body.name,
        },
      });

      if (existingQueue) {
        throw new InvalidRequestError("A queue with this name already exists.");
      }

      // verify the score configs exist
      const scoreConfigs = await prisma.scoreConfig.findMany({
        where: {
          id: { in: body.scoreConfigIds },
          projectId: auth.scope.projectId,
        },
        select: {
          id: true,
        },
      });
      const scoreConfigIdSet = new Set(scoreConfigs.map((config) => config.id));
      if (body.scoreConfigIds.some((id) => !scoreConfigIdSet.has(id))) {
        throw new InvalidRequestError(
          "At least one of the score config IDs cannot be found for the given project.",
        );
      }

      const queue = await prisma.annotationQueue.create({
        data: {
          projectId: auth.scope.projectId,
          name: body.name,
          description: body.description,
          scoreConfigIds: body.scoreConfigIds,
        },
      });

      return {
        id: queue.id,
        name: queue.name,
        description: queue.description,
        scoreConfigIds: queue.scoreConfigIds,
        createdAt: queue.createdAt,
        updatedAt: queue.updatedAt,
      };
    },
  }),
});
