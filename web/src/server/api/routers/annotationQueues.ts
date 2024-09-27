import { auditLog } from "@/src/features/audit-logs/auditLog";
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
  optionalPaginationZod,
  paginationZod,
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
      const [queues, totalCount, scoreConfigs] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            description?: string | null;
            scoreConfigs: string[];
            createdAt: string;
            countCompletedItems: number;
            countPendingItems: number;
          }>
        >(Prisma.sql`
          SELECT
            aq.id,
            aq.name,
            aq.description,
            aq.score_configs AS "scoreConfigs",
            aq.created_at AS "createdAt",
            COALESCE(SUM(CASE WHEN aqi.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS "countCompletedItems",
            COALESCE(SUM(CASE WHEN aqi.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS "countPendingItems"
          FROM
            annotation_queues aq
          LEFT JOIN
            annotation_queue_items aqi ON aq.id = aqi.queue_id
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
            queue.scoreConfigs.includes(config.id),
          ),
        })),
      };
    }),
  allNamesAndIds: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
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
    }),
  byId: protectedProjectProcedure
    .input(z.object({ queueId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: { id: input.queueId, projectId: input.projectId },
      });

      const configs = await ctx.prisma.scoreConfig.findMany({
        where: {
          projectId: input.projectId,
          id: {
            in: queue?.scoreConfigs ?? [],
          },
        },
      });

      return {
        ...queue,
        scoreConfigs: filterAndValidateDbScoreConfigList(configs),
      };
    }),
  pendingItemsByQueueId: protectedProjectProcedure
    .input(z.object({ queueId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const items = await ctx.prisma.annotationQueueItem.findMany({
        where: {
          queueId: input.queueId,
          projectId: input.projectId,
          status: AnnotationQueueStatus.PENDING,
        },
        select: {
          id: true,
        },
      });
      return items.map((item) => item.id);
    }),
  create: protectedProjectProcedure
    .input(
      CreateQueueData.extend({
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

        const queue = await ctx.prisma.annotationQueue.create({
          data: {
            name: input.name,
            projectId: input.projectId,
            description: input.description,
            scoreConfigs: input.scoreConfigs,
          },
        });

        if (!queue) {
          throw new Error("Failed to create queue");
        }

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
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          // P2002: "Unique constraint failed on the {constraint}", see prisma docs https://www.prisma.io/docs/orm/reference/error-reference
          if (error.code === "P2002") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "A queue with this name already exists in the project",
            });
          }
        }
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
    .input(z.object({ queueId: z.string(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "scoreConfigs:CUD",
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
              parentObjectId: string | null;
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
	          o.trace_id AS "parentObjectId",
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
  next: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const item = await ctx.prisma.annotationQueueItem.findFirst({
        where: {
          queueId: input.queueId,
          projectId: input.projectId,
          status: AnnotationQueueStatus.PENDING,
          OR: [
            { editStartTime: null },
            { editStartTime: { lt: fiveMinutesAgo } },
          ],
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!item) return null;

      await ctx.prisma.annotationQueueItem.update({
        where: {
          id: item.id,
        },
        data: {
          editStartTime: now,
          editStartByUserId: ctx.session.user.id,
        },
      });

      if (item.objectType === AnnotationQueueObjectType.OBSERVATION) {
        const observation = await ctx.prisma.observation.findUnique({
          where: {
            id: item.objectId,
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
});
