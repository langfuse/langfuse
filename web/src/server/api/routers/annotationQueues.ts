import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  CreateQueueData,
  filterAndValidateDbScoreConfigList,
  LangfuseNotFoundError,
  optionalPaginationZod,
  Prisma,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const queueRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

        const [queues, totalCount, scoreConfigs] = await Promise.all([
          ctx.prisma.$queryRaw<
            Array<{
              id: string;
              name: string;
              description?: string | null;
              scoreConfigIds: string[];
              createdAt: string;
              countCompletedItems: number;
              countPendingItems: number;
            }>
          >(Prisma.sql`
          SELECT
            aq.id,
            aq.name,
            aq.description,
            aq.score_config_ids AS "scoreConfigIds",
            aq.created_at AS "createdAt",
            COALESCE(SUM(CASE WHEN aqi.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS "countCompletedItems",
            COALESCE(SUM(CASE WHEN aqi.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS "countPendingItems"
          FROM
            annotation_queues aq
          LEFT JOIN
            annotation_queue_items aqi ON aq.id = aqi.queue_id AND aqi.project_id = aq.project_id
          WHERE
            aq.project_id = ${input.projectId}
          GROUP BY
            aq.id, aq.name, aq.description, aq.created_at
          ORDER BY
            aq.created_at DESC
          ${input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty}
          ${input.page && input.limit ? Prisma.sql`OFFSET ${input.page * input.limit}` : Prisma.empty}
        `),
          ctx.prisma.annotationQueue.count({
            where: {
              projectId: input.projectId,
            },
          }),
          ctx.prisma.scoreConfig.findMany({
            where: {
              projectId: input.projectId,
            },
            select: {
              id: true,
              name: true,
              dataType: true,
            },
          }),
        ]);

        return {
          totalCount,
          queues: queues.map((queue) => ({
            ...queue,
            scoreConfigs: scoreConfigs.filter((config) =>
              queue.scoreConfigIds.includes(config.id),
            ),
          })),
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queues failed.",
        });
      }
    }),
  allNamesAndIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        const queueNamesAndIds = await ctx.prisma.annotationQueue.findMany({
          where: {
            projectId: input.projectId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        return queueNamesAndIds;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queues failed.",
        });
      }
    }),
  byId: protectedProjectProcedure
    .input(z.object({ queueId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

        const queue = await ctx.prisma.annotationQueue.findUnique({
          where: { id: input.queueId, projectId: input.projectId },
        });

        const configs = await ctx.prisma.scoreConfig.findMany({
          where: {
            projectId: input.projectId,
            id: {
              in: queue?.scoreConfigIds ?? [],
            },
          },
        });

        return {
          ...queue,
          scoreConfigs: filterAndValidateDbScoreConfigList(configs),
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queue failed.",
        });
      }
    }),
  byObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

        const queues = await ctx.prisma.annotationQueue.findMany({
          where: {
            projectId: input.projectId,
          },
          select: {
            id: true,
            name: true,
            annotationQueueItem: {
              where: {
                objectId: input.objectId,
                objectType: input.objectType,
              },
              select: {
                queueId: true,
                status: true,
                id: true,
              },
            },
          },
        });

        let totalCount = 0;

        return {
          queues: queues.map((queue) => {
            totalCount += queue.annotationQueueItem.length;
            return {
              id: queue.id,
              name: queue.name,
              itemId: queue.annotationQueueItem[0]?.id, // Safely access the first item's id
              status: queue.annotationQueueItem[0]?.status, // Safely access the first item's status
              // Since there may be multiple queue items in a given queue, but with the same objectId, we select only the first one
              // to simplify the logic and because we are only interested in the first item's details.
            };
          }),
          totalCount,
          // If the given objectId has been added to the same queue more than once, the total count will reflect that, by counting each item (incl duplicates)
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queue by objectId failed.",
        });
      }
    }),
  create: protectedProjectProcedure
    .input(
      CreateQueueData.extend({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const existingQueue = await ctx.prisma.annotationQueue.findFirst({
          where: {
            projectId: input.projectId,
            name: input.name,
          },
        });

        if (existingQueue) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A queue with this name already exists in the project",
          });
        }

        const queue = await ctx.prisma.annotationQueue.create({
          data: {
            name: input.name,
            projectId: input.projectId,
            description: input.description,
            scoreConfigIds: input.scoreConfigIds,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "annotationQueue",
          resourceId: queue.id,
          action: "create",
          after: queue,
        });

        return queue;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating annotation queue failed.",
        });
      }
    }),
  update: protectedProjectProcedure
    .input(
      CreateQueueData.extend({
        projectId: z.string(),
        queueId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const queue = await ctx.prisma.annotationQueue.findFirst({
          where: {
            id: input.queueId,
            projectId: input.projectId,
            name: input.name,
          },
        });

        if (!queue) {
          throw new LangfuseNotFoundError("Queue not found in project");
        }

        const updatedQueue = await ctx.prisma.annotationQueue.update({
          where: { id: input.queueId, projectId: input.projectId },
          data: {
            name: input.name,
            description: input.description,
            scoreConfigIds: input.scoreConfigIds,
          },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "annotationQueue",
          resourceId: queue.id,
          action: "update",
          before: queue,
          after: updatedQueue,
        });

        return updatedQueue;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Updating annotation queue failed.",
        });
      }
    }),
  delete: protectedProjectProcedure
    .input(z.object({ queueId: z.string(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });
        const queue = await ctx.prisma.annotationQueue.delete({
          where: { id: input.queueId, projectId: input.projectId },
        });

        await auditLog({
          session: ctx.session,
          resourceType: "annotationQueue",
          resourceId: queue.id,
          action: "delete",
          before: queue,
        });

        return queue;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deleting annotation queue failed.",
        });
      }
    }),
  fetchAndLockNext: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
        seenItemIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoEntitlement({
          entitlement: "annotation-queues",
          projectId: input.projectId,
          sessionUser: ctx.session.user,
        });

        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        const item = await ctx.prisma.annotationQueueItem.findFirst({
          where: {
            queueId: input.queueId,
            projectId: input.projectId,
            status: AnnotationQueueStatus.PENDING,
            OR: [
              { lockedAt: null },
              { lockedAt: { lt: fiveMinutesAgo } },
              { lockedByUserId: ctx.session.user.id },
            ],
            NOT: {
              id: { in: input.seenItemIds },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        // Expected behavior, non-error case: all items have been seen AND/OR completed, no more unseen pending items
        if (!item) return null;

        const updatedItem = await ctx.prisma.annotationQueueItem.update({
          where: {
            id: item.id,
            projectId: input.projectId,
          },
          data: {
            lockedAt: now,
            lockedByUserId: ctx.session.user.id,
          },
        });

        const inflatedUpdatedItem = {
          ...updatedItem,
          lockedByUser: { name: ctx.session.user.name },
        };

        if (item.objectType === AnnotationQueueObjectType.OBSERVATION) {
          const observation = await ctx.prisma.observation.findUnique({
            where: {
              id: item.objectId,
              projectId: input.projectId,
            },
            select: {
              id: true,
              traceId: true,
            },
          });

          return {
            ...inflatedUpdatedItem,
            parentTraceId: observation?.traceId,
          };
        }

        return inflatedUpdatedItem;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching and locking next annotation queue item failed.",
        });
      }
    }),
});
