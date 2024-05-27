import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { ScoreDataType } from "@langfuse/shared/src/db";
import { z } from "zod";

const ScoreConfigFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const ScoreConfigAllOptions = ScoreConfigFilterOptions.extend({
  ...paginationZod,
});

const category = z.object({
  label: z.string().min(1),
  value: z.number(),
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

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        dataType: z.enum([ScoreDataType.NUMERIC, ScoreDataType.CATEGORICAL]),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        categories: z.array(category).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      const config = await ctx.prisma.scoreConfig.create({
        data: {
          ...input,
        },
      });

      return config;
    }),
});
