import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  BatchActionQuerySchema,
  BatchActionType,
  BatchExportTableName,
  paginationZod,
  Prisma,
} from "@langfuse/shared";
import {
  getObservationById,
  getTraceIdsForObservations,
  logger,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

const isItemLocked = (item: AnnotationQueueItem) => {
  return (
    item.lockedByUserId &&
    item.lockedAt &&
    new Date(item.lockedAt) > new Date(Date.now() - 5 * 60 * 1000)
  );
};

export const queueItemRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

        const item = await ctx.prisma.annotationQueueItem.findUnique({
          where: {
            id: input.itemId,
            projectId: input.projectId,
          },
        });

        // Expected behavior, non-error case: if user has seen item in given session, prior to it being deleted, we return null
        if (!item) return null;
        let lockedByUser: { name: string | null } | null = null;

        if (isItemLocked(item)) {
          lockedByUser = await ctx.prisma.user.findUnique({
            where: {
              id: item.lockedByUserId as string,
            },
            select: {
              name: true,
            },
          });
        }

        const inflatedItem = {
          ...item,
          lockedByUser,
        };

        if (item.objectType === AnnotationQueueObjectType.OBSERVATION) {
          const clickhouseObservation = await getObservationById({
            id: item.objectId,
            projectId: input.projectId,
          });
          return {
            ...inflatedItem,
            parentTraceId: clickhouseObservation?.traceId,
          };
        }

        return inflatedItem;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching annotation queue item by id failed.",
        });
      }
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
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

        const [queueItems, totalItems] = await Promise.all([
          await ctx.prisma.$queryRaw<
            Array<{
              id: string;
              status: AnnotationQueueStatus;
              objectId: string;
              objectType: AnnotationQueueObjectType;
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
              aqi.completed_at AS "completedAt",
              aqi.annotator_user_id AS "annotatorUserId",
              u.image AS "annotatorUserImage", 
              u.name AS "annotatorUserName"
            FROM
              annotation_queue_items aqi
            LEFT JOIN 
              users u ON u.id = aqi.annotator_user_id AND u.id in (SELECT user_id FROM organization_memberships WHERE org_id = ${ctx.session.orgId})
            WHERE 
              aqi.project_id = ${input.projectId} AND aqi.queue_id = ${input.queueId}
            ORDER BY 
              aqi.created_at ASC,
              aqi.object_id ASC,
              aqi.object_type ASC
            ${input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty}
            ${input.page && input.limit ? Prisma.sql`OFFSET ${input.page * input.limit}` : Prisma.empty}
          `),
          ctx.prisma.annotationQueueItem.count({
            where: {
              queueId: input.queueId,
              projectId: input.projectId,
            },
          }),
        ]);

        const observationIds = queueItems
          .filter(
            (item) => item.objectType === AnnotationQueueObjectType.OBSERVATION,
          )
          .map((item) => item.objectId);

        const traceIds =
          observationIds.length > 0
            ? await getTraceIdsForObservations(input.projectId, observationIds)
            : [];

        return {
          queueItems: queueItems.map((item) => ({
            ...item,
            parentTraceId:
              traceIds.find((t) => t.id === item.objectId)?.traceId || null,
          })),
          totalItems,
        };
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
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:read",
        });

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
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Fetching unseen pending item count by queueId failed.",
        });
      }
    }),
  createMany: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        objectIds: z
          .array(z.string())
          .min(1, "Minimum 1 object_id is required."),
        objectType: z.enum(AnnotationQueueObjectType),
        query: BatchActionQuerySchema.optional(),
        isBatchAction: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        let createdCount = 0;

        if (input.isBatchAction && input.query) {
          await createBatchActionJob({
            projectId: input.projectId,
            actionId: "trace-add-to-annotation-queue",
            actionType: BatchActionType.Create,
            tableName: BatchExportTableName.Traces,
            session: ctx.session,
            query: input.query,
            targetId: input.queueId,
          });
        } else {
          const { count } = await ctx.prisma.annotationQueueItem.createMany({
            data: input.objectIds.map((objectId) => ({
              projectId: input.projectId,
              queueId: input.queueId,
              objectId,
              objectType: input.objectType,
            })),
            skipDuplicates: true,
          });
          createdCount = count;

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
        }

        const queue = await ctx.prisma.annotationQueue.findUnique({
          where: {
            id: input.queueId,
            projectId: input.projectId,
          },
          select: {
            name: true,
            id: true,
          },
        });

        return {
          createdCount,
          queueName: queue?.name,
          queueId: queue?.id,
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

        const item = await ctx.prisma.annotationQueueItem.update({
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

        await auditLog({
          resourceType: "annotationQueueItem",
          resourceId: item.id,
          action: "complete",
          after: item,
          session: ctx.session,
        });

        return item;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "The item to complete was not found, it was likely deleted.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Completing annotation queue item failed.",
        });
      }
    }),
});
