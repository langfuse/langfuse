import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const queueItemRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const item = await ctx.prisma.annotationQueueItem.findUnique({
        where: {
          id: input.itemId,
          projectId: input.projectId,
        },
      });

      if (!item) return null;

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
          ...item,
          parentObjectId: observation?.traceId,
        };
      }

      return item;
    }),
  getItemsByObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      const [referencedItems, queueNamesAndIds] = await Promise.all([
        ctx.prisma.annotationQueueItem.findMany({
          where: {
            projectId: input.projectId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
          select: {
            queueId: true,
            status: true,
          },
        }),
        ctx.prisma.annotationQueue.findMany({
          where: {
            projectId: input.projectId,
          },
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      const referencedItemsMap = new Map(
        referencedItems.map((item) => [item.queueId, item.status]),
      );

      return {
        queues: queueNamesAndIds.map((queue) => {
          return {
            id: queue.id,
            name: queue.name,
            includesItem: referencedItemsMap.has(queue.id),
            status: referencedItemsMap.get(queue.id) || undefined,
          };
        }),
        totalCount: referencedItemsMap.size,
      };
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });
        const queueItem = await ctx.prisma.annotationQueueItem.create({
          data: {
            projectId: input.projectId,
            queueId: input.queueId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
        });

        return queueItem;
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
  createMany: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        objectIds: z.array(z.string()),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const { count } = await ctx.prisma.annotationQueueItem.createMany({
          data: input.objectIds.map((objectId) => ({
            projectId: input.projectId,
            queueId: input.queueId,
            objectId,
            objectType: input.objectType,
          })),
          skipDuplicates: true,
        });

        const createdItems = await ctx.prisma.annotationQueueItem.findMany({
          where: {
            projectId: input.projectId,
            queueId: input.queueId,
            objectId: { in: input.objectIds },
            objectType: input.objectType,
          },
          orderBy: { createdAt: "desc" },
        });

        for (const item of createdItems) {
          await auditLog(
            {
              session: ctx.session,
              resourceType: "annotationQueueItem",
              resourceId: item.id,
              action: "create",
              after: item,
            },
            ctx.prisma,
          );
        }

        return {
          createdCount: count,
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Creating multiple annotation queue items failed.",
        });
      }
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
        queueId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const item = await ctx.prisma.annotationQueueItem.findFirst({
          where: {
            objectId: input.objectId,
            objectType: input.objectType,
            projectId: input.projectId,
            queueId: input.queueId,
          },
        });

        if (!item) {
          throw new LangfuseNotFoundError("Annotation queue item not found.");
        }

        const deletedItem = await ctx.prisma.annotationQueueItem.delete({
          where: {
            id: item.id,
            projectId: input.projectId,
          },
        });

        await auditLog({
          resourceType: "annotationQueueItem",
          resourceId: deletedItem.id,
          action: "delete",
          session: ctx.session,
        });

        return deletedItem;
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
  deleteMany: protectedProjectProcedure
    .input(
      z.object({
        itemIds: z.array(z.string()).min(1, "Minimum 1 item_id is required."),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const items = await ctx.prisma.annotationQueueItem.findMany({
          where: {
            id: {
              in: input.itemIds,
            },
            projectId: input.projectId,
          },
        });

        for (const item of items) {
          await auditLog({
            resourceType: "annotationQueueItem",
            resourceId: item.id,
            before: item,
            action: "delete",
            session: ctx.session,
          });
        }

        const { count } = await ctx.prisma.annotationQueueItem.deleteMany({
          where: {
            id: {
              in: input.itemIds,
            },
            projectId: input.projectId,
          },
        });

        return {
          deletedCount: count,
        };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deleting annotation queue items failed.",
        });
      }
    }),
  complete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        annotationQueueId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const item = await ctx.prisma.annotationQueueItem.updateMany({
          where: {
            queueId: input.annotationQueueId,
            projectId: input.projectId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
          data: {
            status: AnnotationQueueStatus.COMPLETED,
            completedAt: new Date(),
            annotatorUserId: ctx.session.user.id,
          },
        });

        return item;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Completing annotation queue item failed.",
        });
      }
    }),
});
