import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { optionalPaginationZod } from "@/src/utils/zod";

import { ScoreDataType } from "@langfuse/shared/src/db";
import { z } from "zod";

const ScoreConfigFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const ScoreConfigAllOptions = ScoreConfigFilterOptions.extend({
  ...optionalPaginationZod,
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

      try {
        const configs = await ctx.prisma.scoreConfig.findMany({
          where: {
            projectId: input.projectId,
          },
          orderBy: {
            createdAt: "desc",
          },
          ...(input.limit !== undefined && input.page !== undefined
            ? { take: input.limit, skip: input.page * input.limit }
            : undefined),
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
      } catch (error) {
        console.log(error);
      }
    }),

  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        dataType: z.nativeEnum(ScoreDataType),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        categories: z.array(category).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      try {
        const config = await ctx.prisma.scoreConfig.create({
          data: {
            ...input,
          },
        });

        return config;
      } catch (error) {
        console.log(error);
      }
    }),
});
