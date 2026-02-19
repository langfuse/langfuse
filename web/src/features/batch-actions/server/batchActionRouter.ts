import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { GetBatchActionByIdSchema } from "../validation";
import { addToDatasetRouter } from "./addToDatasetRouter";
import { runEvaluationRouter } from "./runEvaluationRouter";

export const batchActionRouter = createTRPCRouter({
  addToDataset: addToDatasetRouter,
  runEvaluation: runEvaluationRouter,
  byId: protectedProjectProcedure
    .input(GetBatchActionByIdSchema)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const batchAction = await ctx.prisma.batchAction.findUnique({
        where: {
          id: input.batchActionId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          status: true,
          totalCount: true,
          processedCount: true,
          failedCount: true,
          log: true,
          createdAt: true,
          finishedAt: true,
          actionType: true,
          tableName: true,
          config: true,
        },
      });

      if (!batchAction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Batch action not found",
        });
      }

      return batchAction;
    }),

  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const [batchActions, totalCount] = await Promise.all([
        ctx.prisma.batchAction.findMany({
          where: {
            projectId: input.projectId,
          },
          take: input.limit,
          skip: input.page * input.limit,
          orderBy: {
            createdAt: "desc",
          },
        }),
        ctx.prisma.batchAction.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      // Look up users for each action
      const userIds = [...new Set(batchActions.map((a) => a.userId))];
      const users = await ctx.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
          organizationMemberships: {
            some: {
              organization: {
                projects: {
                  some: {
                    id: input.projectId,
                  },
                },
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          image: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        batchActions: batchActions.map((action) => ({
          ...action,
          user: userMap.get(action.userId) ?? null,
        })),
        totalCount,
      };
    }),
});
