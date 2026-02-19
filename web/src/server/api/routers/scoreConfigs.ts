import { z } from "zod/v4";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterAndValidateDbScoreConfigList,
  InvalidRequestError,
  LangfuseNotFoundError,
  optionalPaginationZod,
  ScoreConfigCategory,
  ScoreConfigDataType,
  validateDbScoreConfig,
  validateDbScoreConfigSafe,
} from "@langfuse/shared";
import { traceException } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const ScoreConfigAllInput = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
});

const ScoreConfigAllInputPaginated = ScoreConfigAllInput.extend({
  ...optionalPaginationZod,
});

const ScoreConfigCreateInput = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(35),
  dataType: z.enum(ScoreConfigDataType),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  categories: z.array(ScoreConfigCategory).optional(),
  description: z.string().nullish(),
});

const ScoreConfigUpdateInput = z.object({
  projectId: z.string(),
  id: z.string(),
  // Optional fields that may be updated
  isArchived: z.boolean().optional(),
  name: z.string().min(1).max(35).optional(),
  description: z.string().nullish(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  categories: z.array(ScoreConfigCategory).optional(),
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

      const [configs, totalCount] = await Promise.all([
        ctx.prisma.scoreConfig.findMany({
          where: {
            projectId: input.projectId,
          },
          ...(input.limit !== undefined && input.page !== undefined
            ? { take: input.limit, skip: input.page * input.limit }
            : undefined),
          orderBy: {
            createdAt: "desc",
          },
        }),
        ctx.prisma.scoreConfig.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      return {
        configs: filterAndValidateDbScoreConfigList(configs, traceException),
        totalCount,
      };
    }),
  create: protectedProjectProcedure
    .input(ScoreConfigCreateInput)
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

      await auditLog({
        session: ctx.session,
        resourceType: "scoreConfig",
        resourceId: config.id,
        action: "create",
        after: config,
      });

      return validateDbScoreConfig(config);
    }),
  update: protectedProjectProcedure
    .input(ScoreConfigUpdateInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:CUD",
      });

      const existingConfig = await ctx.prisma.scoreConfig.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
      if (!existingConfig) {
        throw new LangfuseNotFoundError(
          "No score config with this id in this project.",
        );
      }

      // Merge the input with the existing config and verify schema compliance
      const result = validateDbScoreConfigSafe({ ...existingConfig, ...input });

      if (!result.success) {
        throw new InvalidRequestError(
          result.error.issues.map((issue) => issue.message).join(", "),
        );
      }

      const config = await ctx.prisma.scoreConfig.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: { ...input },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "scoreConfig",
        resourceId: config.id,
        action: "update",
        before: existingConfig,
        after: config,
      });

      return validateDbScoreConfig(config);
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scoreConfigs:read",
      });

      const config = await ctx.prisma.scoreConfig.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      if (!config) {
        throw new Error("No score config with this id in this project.");
      }

      return validateDbScoreConfig(config);
    }),
});
