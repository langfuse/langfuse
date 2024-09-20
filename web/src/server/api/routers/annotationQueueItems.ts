import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
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
        await ctx.prisma.annotationQueueItem.deleteMany({
          where: {
            projectId: input.projectId,
            queueId: input.queueId,
            objectId: input.objectId,
            objectType: input.objectType,
          },
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
});
