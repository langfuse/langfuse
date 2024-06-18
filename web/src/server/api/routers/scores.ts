import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type ProjectRole, Prisma, type Score } from "@langfuse/shared/src/db";
import { paginationZod } from "@langfuse/shared";
import { ScoreDataType, singleFilter } from "@langfuse/shared";
import {
  tableColumnsToSqlFilterAndPrefix,
  orderByToPrismaSql,
} from "@langfuse/shared";
import {
  type ScoreOptions,
  scoresTableCols,
} from "@/src/server/api/definitions/scoresTable";
import { orderBy } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const ScoreFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
});

const ScoreAllOptions = ScoreFilterOptions.extend({
  ...paginationZod,
});

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        scoresTableCols,
        "traces_scores",
      );

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        scoresTableCols,
      );

      const scores = await ctx.prisma.$queryRaw<
        Array<
          Score & {
            traceName: string | null;
            traceUserId: string | null;
            jobConfigurationId: string | null;
            authorUserImage: string | null;
            authorUserName: string | null;
          }
        >
      >(
        generateScoresQuery(
          Prisma.sql` 
          s.id,
          s.name,
          s.value,
          s.string_value AS "stringValue",
          s.timestamp,
          s.source,
          s.data_type AS "dataType",
          s.comment,
          s.trace_id AS "traceId",
          s.observation_id AS "observationId",
          s.author_user_id AS "authorUserId",
          t.user_id AS "traceUserId",
          t.name AS "traceName",
          je.job_configuration_id AS "jobConfigurationId",
          u.image AS "authorUserImage", 
          u.name AS "authorUserName"
          `,
          input.projectId,
          filterCondition,
          orderByCondition,
          input.limit,
          input.page,
        ),
      );

      const scoresCount = await ctx.prisma.$queryRaw<
        Array<{ totalCount: bigint }>
      >(
        generateScoresQuery(
          Prisma.sql` count(*) AS "totalCount"`,
          input.projectId,
          filterCondition,
          Prisma.empty,
          1, // limit
          0, // page
        ),
      );

      return {
        scores,
        totalCount:
          scoresCount.length > 0 ? Number(scoresCount[0]?.totalCount) : 0,
      };
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const names = await ctx.prisma.score.groupBy({
        where: {
          projectId: input.projectId,
        },
        by: ["name"],
        _count: {
          _all: true,
        },
        take: 1000,
        orderBy: {
          _count: {
            id: "desc",
          },
        },
      });

      const res: ScoreOptions = {
        name: names.map((i) => ({ value: i.name, count: i._count._all })),
      };

      return res;
    }),
  createAnnotationScore: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        observationId: z.string().optional(),
        name: z.string(),
        value: z.number(),
        stringValue: z.string().optional(),
        comment: z.string().optional().nullable(),
        configId: z.string().optional(),
        dataType: z.nativeEnum(ScoreDataType),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });

      const trace = await ctx.prisma.trace.findFirst({
        where: {
          id: input.traceId,
          projectId: input.projectId,
        },
      });
      if (!trace) {
        throw new Error("No trace with this id in this project.");
      }

      try {
        const existingScore = await ctx.prisma.score.findFirst({
          where: {
            projectId: input.projectId,
            traceId: input.traceId,
            observationId: input.observationId,
            source: "ANNOTATION",
            configId: input.configId,
          },
        });

        if (existingScore) {
          return ctx.prisma.score.update({
            where: {
              id: existingScore.id,
              projectId: input.projectId,
            },
            data: {
              value: input.value,
              stringValue: input.stringValue,
              comment: input.comment,
              authorUserId: ctx.session.user.id,
            },
          });
        }

        const score = await ctx.prisma.score.create({
          data: {
            projectId: input.projectId,
            traceId: input.traceId,
            observationId: input.observationId,
            value: input.value,
            stringValue: input.stringValue,
            dataType: input.dataType,
            configId: input.configId,
            name: input.name,
            comment: input.comment,
            authorUserId: ctx.session.user.id,
            source: "ANNOTATION",
          },
        });
        await auditLog({
          projectId: input.projectId,
          userId: ctx.session.user.id,
          userProjectRole: ctx.session.user.projects.find(
            (p) => p.id === input.projectId,
          )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
          resourceType: "score",
          resourceId: score.id,
          action: "create",
          after: score,
        });
        return score;
      } catch (error) {
        console.log(error);
        throw error;
      }
    }),
  updateAnnotationScore: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        value: z.number(),
        stringValue: z.string().optional(),
        comment: z.string().optional().nullable(),
        configId: z.string().optional(),
        dataType: z.nativeEnum(ScoreDataType),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });
      const score = await ctx.prisma.score.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
          source: "ANNOTATION",
        },
      });
      if (!score) {
        throw new Error("No annotation score with this id in this project.");
      }

      try {
        await auditLog({
          projectId: input.projectId,
          userId: ctx.session.user.id,
          userProjectRole: ctx.session.user.projects.find(
            (p) => p.id === input.projectId,
          )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
          resourceType: "score",
          resourceId: score.id,
          action: "update",
          after: score,
        });

        return ctx.prisma.score.update({
          where: {
            id: score.id,
            projectId: input.projectId,
          },
          data: {
            value: input.value,
            stringValue: input.stringValue,
            comment: input.comment,
            authorUserId: ctx.session.user.id,
          },
        });
      } catch (error) {
        console.log(error);
        throw error;
      }
    }),
  deleteAnnotationScore: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });

      const score = await ctx.prisma.score.findFirst({
        where: {
          id: input.id,
          source: "ANNOTATION",
          projectId: input.projectId,
        },
      });
      if (!score) {
        throw new Error("No annotation score with this id in this project.");
      }

      await auditLog({
        projectId: input.projectId,
        userId: ctx.session.user.id,
        userProjectRole: ctx.session.user.projects.find(
          (p) => p.id === input.projectId,
        )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
        resourceType: "score",
        resourceId: score.id,
        action: "delete",
        before: score,
      });

      return ctx.prisma.score.delete({
        where: {
          id: score.id,
          projectId: input.projectId,
        },
      });
    }),
});

const generateScoresQuery = (
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
  FROM scores s
  JOIN traces t ON t.id = s.trace_id AND t.project_id = ${projectId}
  LEFT JOIN job_executions je ON je.job_output_score_id = s.id AND je.project_id = ${projectId}
  LEFT JOIN users u ON u.id = s.author_user_id
  WHERE s.project_id = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
};
