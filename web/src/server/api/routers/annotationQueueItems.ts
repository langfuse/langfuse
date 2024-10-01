import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  paginationZod,
  Prisma,
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
          parentTraceId: observation?.traceId,
        };
      }

      return item;
    }),
  itemsByQueueId: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const [queueItems, totalItems] = await Promise.all([
          // queueItems
          ctx.prisma.$queryRaw<
            Array<{
              id: string;
              status: AnnotationQueueStatus;
              objectId: string;
              objectType: AnnotationQueueObjectType;
              parentTraceId: string | null;
              completedAt: string | null;
              annotatorUserId: string | null;
              annotatorUserImage: string | null;
              annotatorUserName: string | null;
            }>
          >(Prisma.sql`
          SELECT
            aqi.id,
            aqi.status,
            aqi.object_id AS "objectId",
            aqi.object_type AS "objectType",
	          o.trace_id AS "parentTraceId",
            aqi.completed_at AS "completedAt",
            aqi.annotator_user_id AS "annotatorUserId",
            u.image AS "annotatorUserImage", 
            u.name AS "annotatorUserName"
          FROM
            annotation_queue_items aqi
          LEFT JOIN 
            observations o ON o.id = aqi.object_id AND aqi.object_type = 'OBSERVATION' AND o.project_id = ${input.projectId}
          LEFT JOIN 
            users u ON u.id = aqi.annotator_user_id AND u.id in (SELECT user_id FROM organization_memberships WHERE org_id = ${ctx.session.orgId})
          WHERE 
            aqi.project_id = ${input.projectId} AND aqi.queue_id = ${input.queueId}
          ORDER BY 
            aqi.created_at ASC
          ${input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty}
          ${input.page && input.limit ? Prisma.sql`OFFSET ${input.page * input.limit}` : Prisma.empty}
        `),
          // totalItems
          ctx.prisma.annotationQueueItem.count({
            where: {
              queueId: input.queueId,
              projectId: input.projectId,
            },
          }),
        ]);

        return { queueItems, totalItems };
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queue items failed.",
        });
      }
    }),
  unseenPendingItemCountByQueueId: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
        seenItemIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      const count = await ctx.prisma.annotationQueueItem.count({
        where: {
          queueId: input.queueId,
          projectId: input.projectId,
          status: AnnotationQueueStatus.PENDING,
          id: {
            notIn: input.seenItemIds,
          },
        },
      });
      return count;
    }),
  createMany: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        objectIds: z
          .array(z.string())
          .min(1, "Minimum 1 object_id is required."),
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
        itemId: z.string(),
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
            id: input.itemId,
            projectId: input.projectId,
            status: AnnotationQueueStatus.PENDING,
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
