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

export const tableBatchActionRouter = createTRPCRouter({
  addToDataset: addToDatasetRouter,
  byId: protectedProjectProcedure
    .input(GetBatchActionByIdSchema)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "datasets:CUD",
      });

      const tableBatchAction = await ctx.prisma.tableBatchAction.findUnique({
        where: {
          id: input.tableBatchActionId,
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

      if (!tableBatchAction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Table batch action not found",
        });
      }

      return tableBatchAction;
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

      const [tableBatchActions, totalCount] = await Promise.all([
        ctx.prisma.tableBatchAction.findMany({
          where: {
            projectId: input.projectId,
          },
          take: input.limit,
          skip: input.page * input.limit,
          orderBy: {
            createdAt: "desc",
          },
        }),
        ctx.prisma.tableBatchAction.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      // Look up users for each action
      const userIds = [...new Set(tableBatchActions.map((a) => a.userId))];
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
        tableBatchActions: tableBatchActions.map((action) => ({
          ...action,
          user: userMap.get(action.userId) ?? null,
        })),
        totalCount,
      };
    }),
});
