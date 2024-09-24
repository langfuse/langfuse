import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { Item } from "@radix-ui/react-select";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const queueItemRouter = createTRPCRouter({
  getItemsByObjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        objectId: z.string(),
        objectType: z.nativeEnum(AnnotationQueueObjectType),
      }),
    )
    .query(async ({ input, ctx }) => {
      const referencedItems = await ctx.prisma.annotationQueueItem.findMany({
        where: {
          projectId: input.projectId,
          objectId: input.objectId,
          objectType: input.objectType,
        },
        select: {
          queueId: true,
        },
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

      let totalCount = 0;

      return {
        queues: queueNamesAndIds.map((queue) => {
          const includesItem = referencedItems.some(
            ({ queueId }) => queueId === queue.id,
          );
          if (includesItem) totalCount++;
          return {
            id: queue.id,
            name: queue.name,
            includesItem,
          };
        }),
        totalCount,
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
          scope: "scoreConfigs:CUD",
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
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "scoreConfigs:CUD",
        });
        const deletedItem = await ctx.prisma.annotationQueueItem.delete({
          where: {
            id: input.itemId,
            projectId: input.projectId,
          },
        });

        await auditLog({
          resourceType: "annotationQueueItem",
          resourceId: deletedItem.id,
          action: "delete",
          session: ctx.session,
        });
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
          scope: "scoreConfigs:CUD",
        });

        for (const itemId of input.itemIds) {
          await auditLog({
            resourceType: "annotationQueueItem",
            resourceId: itemId,
            action: "delete",
            session: ctx.session,
          });
        }

        return ctx.prisma.annotationQueueItem.deleteMany({
          where: {
            id: {
              in: input.itemIds,
            },
            projectId: input.projectId,
          },
        });
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
      const item = await ctx.prisma.annotationQueueItem.updateMany({
        where: {
          queueId: input.annotationQueueId,
          projectId: input.projectId,
          objectId: input.objectId,
          objectType: input.objectType,
        },
        data: {
          status: AnnotationQueueStatus.COMPLETED,
        },
      });

      return item;
    }),
});
