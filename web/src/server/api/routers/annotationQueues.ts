import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { CreateQueueData, paginationZod, Prisma } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const queueRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
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
          LIMIT
            ${input.limit} OFFSET ${input.page * input.limit}
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
});
