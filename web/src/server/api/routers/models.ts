import { z } from "zod";

import {
  Model,
  ModelUsageUnit,
  Prisma,
  orderBy,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { TRPCError } from "@trpc/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { modelsTableCols } from "@/src/server/api/definitions/modelsTable";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";

const ModelAllOptions = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter),
  orderBy: orderBy,
  ...paginationZod,
});

export const modelRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ModelAllOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        modelsTableCols,
        "models",
      );

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        modelsTableCols,
      );

      const models = await ctx.prisma.$queryRaw<Array<Model>>(
        generateModelsQuery(
          Prisma.sql` 
          m.id,
          m.project_id as "projectId",
          m.model_name as "modelName",
          m.match_pattern as "matchPattern",
          m.start_date as "startDate",
          m.input_price as "inputPrice",
          m.output_price as "outputPrice",
          m.total_price as "totalPrice",
          m.unit,
          m.tokenizer_id as "tokenizerId"`,
          input.projectId,
          filterCondition,
          orderByCondition,
          input.limit,
          input.page,
        ),
      );
      const totalAmount = await ctx.prisma.$queryRaw<
        Array<{ totalCount: bigint }>
      >(
        generateModelsQuery(
          Prisma.sql` count(*) AS "totalCount"`,
          input.projectId,
          filterCondition,
          Prisma.empty,
          1, // limit
          0, // page
        ),
      );
      return {
        models,
        totalCount:
          totalAmount.length > 0 ? Number(totalAmount[0]?.totalCount) : 0,
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

      const deletedModel = await ctx.prisma.model.delete({
        where: {
          id: input.modelId,
          projectId: input.projectId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "model",
        resourceId: input.modelId,
        projectId: input.projectId,
        action: "delete",
        before: deletedModel,
      });

      return deletedModel;
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelName: z.string(),
        matchPattern: z.string(),
        startDate: z.date().optional(),
        inputPrice: z.number().nonnegative().optional(),
        outputPrice: z.number().nonnegative().optional(),
        totalPrice: z.number().nonnegative().optional(),
        unit: z.nativeEnum(ModelUsageUnit),
        tokenizerId: z.enum(["openai", "claude"]).optional(),
        tokenizerConfig: z.record(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "models:CUD",
      });

      // Check if regex is valid POSIX regex
      // Use DB to check, because JS regex is not POSIX compliant
      try {
        await ctx.prisma.$queryRaw(
          Prisma.sql`SELECT 'test_string' ~ ${input.matchPattern}`,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid regex, needs to be Postgres syntax",
        });
      }

      const createdModel = await ctx.prisma.model.create({
        data: {
          projectId: input.projectId,
          modelName: input.modelName,
          matchPattern: input.matchPattern,
          startDate: input.startDate,
          inputPrice: input.inputPrice,
          outputPrice: input.outputPrice,
          totalPrice: input.totalPrice,
          unit: input.unit,
          tokenizerId: input.tokenizerId,
          tokenizerConfig: input.tokenizerConfig,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "model",
        resourceId: createdModel.id,
        projectId: input.projectId,
        action: "create",
        after: createdModel,
      });

      return createdModel;
    }),
});

const generateModelsQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
  FROM models m
  WHERE (m.project_id = ${projectId} OR m.project_id IS NULL)
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
};
