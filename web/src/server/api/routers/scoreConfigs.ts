import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { optionalPaginationZod } from "@langfuse/shared";

import { ScoreDataType } from "@langfuse/shared/src/db";
import { z } from "zod";
import { categoriesList } from "@langfuse/shared";

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
        name: z.string().min(1).max(35),
        dataType: z.nativeEnum(ScoreDataType),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        categories: categoriesList.optional(),
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
        const existingConfig = await ctx.prisma.scoreConfig.findFirst({
          where: {
            projectId: input.projectId,
            name: input.name,
            dataType: input.dataType,
          },
        });

        if (existingConfig)
          throw new Error(
            "Score config with this name and data type already exists",
          );

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
  update: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        isArchived: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      try {
        const config = await ctx.prisma.scoreConfig.update({
          where: {
            id: input.id,
            projectId: input.projectId,
          },
          data: {
            isArchived: input.isArchived,
          },
        });

        return config;
      } catch (error) {
        console.log(error);
      }
    }),
});
