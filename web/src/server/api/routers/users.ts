import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import {
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { Prisma, type Score } from "@langfuse/shared/src/db";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";

const UserFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
});

const UserAllOptions = UserFilterOptions.extend({
  ...paginationZod,
});

export const userRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(UserAllOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter ?? [],
        usersTableCols,
        "users",
      );

      const totalUsers = (
        await ctx.prisma.$queryRaw<
          Array<{
            totalCount: number;
          }>
        >`
        SELECT COUNT(DISTINCT t.user_id)::int AS "totalCount"
        FROM traces t
        WHERE t.project_id = ${input.projectId}
        ${filterCondition}
      `
      )[0].totalCount;

      const users = await ctx.prisma.$queryRaw<
        Array<{
          userId: string;
          totalTraces: number;
        }>
      >`
        SELECT
          t.user_id AS "userId",
          COUNT(t.id)::int AS "totalTraces"
        FROM
          traces t
        WHERE
          t.user_id IS NOT NULL
          AND t.user_id != ''
          AND t.project_id = ${input.projectId}
          ${filterCondition}
        GROUP BY
          t.user_id
        ORDER BY
          "totalTraces" DESC
        LIMIT
          ${input.limit} OFFSET ${input.page * input.limit};
      `;
      return {
        totalUsers,
        users,
      };
    }),

  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userIds: z.array(z.string().min(1)),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.userIds.length === 0) {
        return [];
      }
      const users = await ctx.prisma.$queryRaw<
        Array<{
          userId: string;
          firstTrace: Date | null;
          lastTrace: Date | null;
          totalPromptTokens: number;
          totalCompletionTokens: number;
          totalTokens: number;
          firstObservation: Date | null;
          lastObservation: Date | null;
          totalObservations: number;
          totalCount: number;
          sumCalculatedTotalCost: number;
        }>
      >`
        SELECT
          t.user_id AS "userId",
          MIN(t."timestamp") AS "firstTrace",
          MAX(t."timestamp") AS "lastTrace",
          COALESCE(SUM(o.prompt_tokens), 0)::int AS "totalPromptTokens",
          COALESCE(SUM(o.completion_tokens), 0)::int AS "totalCompletionTokens",
          COALESCE(SUM(o.total_tokens), 0)::int AS "totalTokens",
          MIN(o."firstObservation") AS "firstObservation",
          MAX(o."lastObservation") AS "lastObservation",
          COUNT(o."totalObservations")::int AS "totalObservations",
          (COUNT(*) OVER ())::int AS "totalCount",
          SUM(COALESCE(ov.calculated_total_cost, 0)) AS "sumCalculatedTotalCost"
        FROM
          traces t
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(o.prompt_tokens), 0)::int AS "prompt_tokens",
              COALESCE(SUM(o.completion_tokens), 0)::int AS "completion_tokens",
              COALESCE(SUM(o.total_tokens), 0)::int AS "total_tokens",
              MIN(o.start_time) AS "firstObservation",
              MAX(o.start_time) AS "lastObservation",
              COUNT(DISTINCT o.id)::int AS "totalObservations"
            FROM
              observations o
            WHERE
              o.trace_id = t.id
              AND o.project_id = ${input.projectId}
            GROUP BY
              t.user_id
          ) o ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              SUM(COALESCE(ov.calculated_total_cost, 0)) AS "calculated_total_cost"
            FROM
              observations_view ov
            WHERE
              ov.trace_id = t.id
              AND ov."type" = 'GENERATION'
              AND ov.project_id = ${input.projectId}
            GROUP BY
              t.user_id
          ) ov ON TRUE
        WHERE
          t.user_id IN (${Prisma.join(input.userIds)})
          AND t.project_id = ${input.projectId}
        GROUP BY
          1;
      `;

      if (users.length === 0) {
        return [];
      }

      const lastScoresOfUsers = await ctx.prisma.$queryRaw<
        Array<
          Score & {
            userId: string;
          }
        >
      >`
        WITH ranked_scores AS (
          SELECT
            t.user_id,
            s.*,
            ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY s."timestamp" DESC) AS rn 
          FROM
            scores s
            JOIN traces t ON t.id = s.trace_id
          WHERE
            s.trace_id IS NOT NULL
            AND s.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            AND t.user_id IN (${Prisma.join(users.map((user) => user.userId))})
            AND t.user_id IS NOT NULL
        )
        SELECT
          user_id "userId",
          "id",
          "timestamp",
          "name",
          "value",
          observation_id "observationId",
          trace_id "traceId",
          "comment"
        FROM
          ranked_scores
        WHERE rn = 1
      `;
      return users.map((topUser) => {
        const user = users.find((user) => user.userId === topUser.userId);
        if (!user) {
          console.error("User not found", topUser.userId);
          throw new Error("User not found");
        }
        return {
          ...topUser,
          ...user,
          lastScore: lastScoresOfUsers.find(
            (score) => score.userId === topUser.userId,
          ),
        };
      });
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const agg = await ctx.prisma.$queryRaw<
        {
          userId: string;
          firstTrace: Date;
          lastTrace: Date;
          totalTraces: number;
          totalPromptTokens: number;
          totalCompletionTokens: number;
          totalTokens: number;
          firstObservation: Date;
          lastObservation: Date;
          totalObservations: number;
          sumCalculatedTotalCost: number;
        }[]
      >`
        SELECT 
          t.user_id "userId",
          min(t."timestamp") "firstTrace",
          max(t."timestamp") "lastTrace",
          COUNT(distinct t.id)::int "totalTraces",
          COALESCE(SUM(o.prompt_tokens),0)::int "totalPromptTokens",
          COALESCE(SUM(o.completion_tokens),0)::int "totalCompletionTokens",
          COALESCE(SUM(o.total_tokens),0)::int "totalTokens",
          MIN(o.start_time) "firstObservation",
          MAX(o.start_time) "lastObservation",
          COUNT(distinct o.id)::int "totalObservations",
          SUM(COALESCE(o.calculated_total_cost, 0)) AS "sumCalculatedTotalCost"
        FROM traces t
        LEFT JOIN observations_view o on o.trace_id = t.id
        WHERE t.user_id is not null
        AND t.project_id = ${input.projectId}
        AND o.project_id = ${input.projectId}
        AND t.user_id = ${input.userId}
        GROUP BY 1
        ORDER BY "totalTokens" DESC
        LIMIT 50
      `;

      const lastScoresOfUsers = await ctx.prisma.$queryRaw<
        Array<
          Score & {
            userId: string;
          }
        >
      >`
        WITH ranked_scores AS (
          SELECT
            t.user_id,
            s.*,
            ROW_NUMBER() OVER (PARTITION BY t.user_id ORDER BY s."timestamp" DESC) AS rn 
          FROM
            scores s
            JOIN traces t ON t.id = s.trace_id
          WHERE
            s.trace_id IS NOT NULL
            AND s.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            AND t.user_id = ${input.userId}
            AND t.user_id IS NOT NULL
        )
        SELECT
          user_id "userId",
          "id",
          "timestamp",
          "name",
          "value",
          observation_id "observationId",
          trace_id "traceId",
          "comment"
        FROM
          ranked_scores
        WHERE rn = 1
      `;

      return {
        userId: input.userId,
        firstTrace: agg[0]?.firstTrace,
        lastTrace: agg[0]?.lastTrace,
        totalTraces: agg[0]?.totalTraces ?? 0,
        totalPromptTokens: agg[0]?.totalPromptTokens ?? 0,
        totalCompletionTokens: agg[0]?.totalCompletionTokens ?? 0,
        totalTokens: agg[0]?.totalTokens ?? 0,
        firstObservation: agg[0]?.firstObservation,
        lastObservation: agg[0]?.lastObservation,
        totalObservations: agg[0]?.totalObservations ?? 0,
        lastScore: lastScoresOfUsers[0],
        sumCalculatedTotalCost: agg[0]?.sumCalculatedTotalCost ?? 0,
      };
    }),
});
