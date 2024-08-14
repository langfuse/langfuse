import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  Category,
  filterAndValidateDbScoreConfigList,
  optionalPaginationZod,
  validateDbScoreConfig,
} from "@langfuse/shared";
import { ScoreDataType } from "@langfuse/shared/src/db";
import * as Sentry from "@sentry/node";

const ScoreConfigAllInput = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const ScoreConfigAllInputPaginated = ScoreConfigAllInput.extend({
  ...optionalPaginationZod,
});

export const scoreConfigsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreConfigAllInputPaginated)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:read",
      });

      const configs = await ctx.prisma.scoreConfig.findMany({
        where: {
          projectId: input.projectId,
        },
        ...(input.limit !== undefined && input.page !== undefined
          ? { take: input.limit, skip: input.page * input.limit }
          : undefined),
        orderBy: {
          createdAt: "desc",
        },
      });

      const configsCount = await ctx.prisma.scoreConfig.count({
        where: {
          projectId: input.projectId,
        },
      });

      return {
        configs: filterAndValidateDbScoreConfigList(
          configs,
          Sentry.captureException,
        ),
        totalCount: configsCount,
      };
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(35),
        dataType: z.nativeEnum(ScoreDataType),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        categories: z.array(Category).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      const config = await ctx.prisma.scoreConfig.create({
        data: {
          ...input,
        },
      });

      return validateDbScoreConfig(config);
    }),
  update: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        isArchived: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      const config = await ctx.prisma.scoreConfig.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          isArchived: input.isArchived,
        },
      });

      return validateDbScoreConfig(config);
    }),
});
