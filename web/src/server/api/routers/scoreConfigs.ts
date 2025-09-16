import { z } from "zod/v4";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  Category,
  filterAndValidateDbScoreConfigList,
  optionalPaginationZod,
  Prisma,
  type ScoreConfig,
  singleFilter,
  validateDbScoreConfig,
} from "@langfuse/shared";
import { ScoreDataType } from "@langfuse/shared/src/db";
import {
  tableColumnsToSqlFilterAndPrefix,
  traceException,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { scoreConfigsFilterCols } from "@/src/server/api/definitions/scoreConfigsTable";

const ScoreConfigAllInput = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
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

      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        scoreConfigsFilterCols,
        "score_configs",
      );

      const [configs, count] = await Promise.all([
        ctx.prisma.$queryRaw<ScoreConfig[]>(
          generateScoreConfigsQuery(
            Prisma.sql`
            sc.id as "id",
            sc.name as "name",
            sc.data_type as "dataType",
            sc.created_at as "createdAt",
            sc.updated_at as "updatedAt",
            sc.is_archived as "isArchived",
            sc.min_value as "minValue",
            sc.max_value as "maxValue",
            sc.categories as "categories",
            sc.description as "description",
            sc.project_id as "projectId"
          `,
            input.projectId,
            filterCondition,
            Prisma.sql`ORDER BY sc.created_at DESC`,
            input.limit,
            input.page,
          ),
        ),
        ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
          generateScoreConfigsQuery(
            Prisma.sql`COUNT(*) AS "totalCount"`,
            input.projectId,
            filterCondition,
            Prisma.empty,
            1, // limit
            0, // page
          ),
        ),
      ]);

      return {
        configs: filterAndValidateDbScoreConfigList(configs, traceException),
        totalCount: count.length > 0 ? Number(count[0]?.totalCount) : 0,
      };
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(35),
        dataType: z.enum(ScoreDataType),
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

      const existingConfig = await ctx.prisma.scoreConfig.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
      if (!existingConfig) {
        throw new Error("No score config with this id in this project.");
      }

      const config = await ctx.prisma.scoreConfig.update({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
        data: {
          isArchived: input.isArchived,
        },
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
});

const generateScoreConfigsQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit?: number,
  page?: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
   FROM score_configs sc
   WHERE sc.project_id = ${projectId}
   ${filterCondition}
   ${orderCondition}
   ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
   ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
  `;
};
