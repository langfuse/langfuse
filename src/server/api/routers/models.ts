import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";

const ModelAllOptions = z.object({
  projectId: z.string(),
  ...paginationZod,
});

export const modelRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ModelAllOptions)
    .query(async ({ input, ctx }) => {
      const models = await ctx.prisma.model.findMany({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
        },
        skip: input.page * input.limit,
        orderBy: [
          { modelName: "asc" },
          { unit: "asc" },
          {
            startDate: {
              sort: "desc",
              nulls: "last",
            },
          },
        ],
        take: input.limit,
      });

      const totalAmount = await ctx.prisma.model.count({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
        },
      });

      console.log("models", models);

      return {
        models,
        totalCount: totalAmount,
      };
    }),
  modelNames: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return (
        await ctx.prisma.model.findMany({
          select: {
            modelName: true,
          },
          distinct: ["modelName"],
          orderBy: [{ modelName: "asc" }],
          where: {
            OR: [{ projectId: input.projectId }, { projectId: null }],
          },
        })
      ).map((model) => model.modelName);
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      return ctx.prisma.model.delete({
        where: {
          id: input.modelId,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z
        .object({
          projectId: z.string(),
          modelName: z.string(),
          exactMatchPattern: z
            .string()
            .regex(
              /^[a-zA-Z0-9_.-]+$/,
              "Match pattern must be alphanumeric and may contain _.-",
            ), // risk of invalid regex injection that would break the db join
          startDate: z.date().optional(),
          inputPrice: z.number().positive().optional(),
          outputPrice: z.number().positive().optional(),
          totalPrice: z.number().positive().optional(),
          unit: z.enum(["TOKENS", "CHARACTERS"]),
          tokenizerId: z.enum(["openai", "claude"]).optional(),
          tokenizerConfig: z
            .record(z.union([z.string(), z.number()]))
            .optional(),
        })
        .refine(
          ({ inputPrice, outputPrice, totalPrice }) =>
            (!!inputPrice && !!outputPrice) || !!totalPrice,
          {
            message:
              "Either inputPrice and outputPrice or totalPrice needs to be set",
          },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });
      return ctx.prisma.model.create({
        data: {
          projectId: input.projectId,
          modelName: input.modelName,
          matchPattern: `(?i)^(${input.exactMatchPattern})$`,
          startDate: input.startDate,
          inputPrice: input.inputPrice,
          outputPrice: input.outputPrice,
          totalPrice: input.totalPrice,
          unit: input.unit,
          tokenizerId: input.tokenizerId,
          tokenizerConfig: input.tokenizerConfig,
        },
      });
    }),
});
