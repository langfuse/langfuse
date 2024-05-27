import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { Prisma, type ScoreConfig } from "@langfuse/shared/src/db";
import { z } from "zod";

const ScoreConfigFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const ScoreConfigAllOptions = ScoreConfigFilterOptions.extend({
  ...paginationZod,
});

export const scoreConfigsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreConfigAllOptions)
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:read",
      });

      const configs = await ctx.prisma.scoreConfig.findMany({
        where: {
          projectId: input.projectId,
        },
        skip: input.page * input.limit,
        orderBy: {
          createdAt: "desc",
        },
        take: input.limit,
      });

      const configsCount = await ctx.prisma.scoreConfig.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        configs,
        totalCount: configsCount,
      };
    }),
});
