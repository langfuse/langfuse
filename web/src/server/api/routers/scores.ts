import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type ProjectRole, Prisma, type Score } from "@langfuse/shared/src/db";
import {
  CreateAnnotationScoreData,
  UpdateAnnotationScoreData,
  paginationZod,
} from "@langfuse/shared";
import { singleFilter } from "@langfuse/shared";
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
import { validateDbScore } from "@/src/features/public-api/types/scores";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { tableDateRangeAggregationSettings } from "@/src/utils/date-range-utils";
import { addMinutes } from "date-fns";

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
    .input(CreateAnnotationScoreData)
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

      const existingScore = await ctx.prisma.score.findFirst({
        where: {
          projectId: input.projectId,
          traceId: input.traceId,
          observationId: input.observationId ?? null,
          source: "ANNOTATION",
          configId: input.configId,
        },
      });

      if (existingScore) {
        const updatedScore = await ctx.prisma.score.update({
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
        return validateDbScore(updatedScore);
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
      return validateDbScore(score);
    }),
  updateAnnotationScore: protectedProjectProcedure
    .input(UpdateAnnotationScoreData)
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

      const updatedScore = await ctx.prisma.score.update({
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
      return validateDbScore(updatedScore);
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

      return await ctx.prisma.score.delete({
        where: {
          id: score.id,
          projectId: input.projectId,
        },
      });
    }),
  getScoreKeysAndProps: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        selectedTimeOption: z
          .union([
            z.literal("7 days"),
            z.literal("30 min"),
            z.literal("1 hour"),
            z.literal("6 hours"),
            z.literal("24 hours"),
            z.literal("3 days"),
            z.literal("14 days"),
            z.literal("1 month"),
            z.literal("3 months"),
            z.literal("All time"),
          ])
          .optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const date =
        !!input.selectedTimeOption && input.selectedTimeOption !== "All time"
          ? addMinutes(
              new Date(),
              -tableDateRangeAggregationSettings[input.selectedTimeOption],
            )
          : undefined;

      const scores = await ctx.prisma.score.groupBy({
        where: {
          projectId: input.projectId,
          ...(date ? { timestamp: { gte: date } } : {}),
        },
        take: 1000,
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        by: ["name", "source", "dataType"],
      });

      if (scores.length === 0) return [];
      return scores.map(({ name, source, dataType }) => ({
        key: composeAggregateScoreKey({ name, source, dataType }),
        name: name,
        source: source,
        dataType: dataType,
      }));
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
  LEFT JOIN traces t ON t.id = s.trace_id AND t.project_id = ${projectId}
  LEFT JOIN job_executions je ON je.job_output_score_id = s.id AND je.project_id = ${projectId}
  LEFT JOIN users u ON u.id = s.author_user_id
  WHERE s.project_id = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
};
