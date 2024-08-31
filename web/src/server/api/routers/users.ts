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
import { Prisma } from "@langfuse/shared/src/db";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";
import { type LastUserScore } from "@/src/features/scores/lib/types";

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

      const [users, totalUsers] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<{
            userId: string;
            totalTraces: bigint;
          }>
        >`
          SELECT
            t.user_id AS "userId",
            COUNT(t.id)::bigint AS "totalTraces"
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
        `,
        ctx.prisma.$queryRaw<
          Array<{
            totalCount: bigint;
          }>
        >`
          SELECT COUNT(DISTINCT t.user_id)::bigint AS "totalCount"
          FROM traces t
          WHERE t.project_id = ${input.projectId}
          ${filterCondition}
        `,
      ]);

      return {
        totalUsers: totalUsers[0].totalCount,
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
          totalPromptTokens: bigint;
          totalCompletionTokens: bigint;
          totalTokens: bigint;
          firstObservation: Date | null;
          lastObservation: Date | null;
          totalObservations: bigint;
          totalCount: bigint;
          sumCalculatedTotalCost: number;
        }>
      >`
        SELECT
          t.user_id AS "userId",
          MIN(t."timestamp") AS "firstTrace",
          MAX(t."timestamp") AS "lastTrace",
          COALESCE(SUM(o.prompt_tokens), 0)::bigint AS "totalPromptTokens",
          COALESCE(SUM(o.completion_tokens), 0)::bigint AS "totalCompletionTokens",
          COALESCE(SUM(o.total_tokens), 0)::bigint AS "totalTokens",
          MIN(o."firstObservation") AS "firstObservation",
          MAX(o."lastObservation") AS "lastObservation",
          COUNT(o."totalObservations")::bigint AS "totalObservations",
          (COUNT(*) OVER ())::bigint AS "totalCount",
          SUM(COALESCE(ov.calculated_total_cost, 0)) AS "sumCalculatedTotalCost"
        FROM
          traces t
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(SUM(o.prompt_tokens), 0)::bigint AS "prompt_tokens",
              COALESCE(SUM(o.completion_tokens), 0)::bigint AS "completion_tokens",
              COALESCE(SUM(o.total_tokens), 0)::bigint AS "total_tokens",
              MIN(o.start_time) AS "firstObservation",
              MAX(o.start_time) AS "lastObservation",
              COUNT(DISTINCT o.id)::bigint AS "totalObservations"
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
        Array<LastUserScore>
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
          "comment",
          "source",
          data_type "dataType",
          "string_value" "stringValue"
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
      const [agg, lastScoresOfUsers] = await Promise.all([
        // agg
        ctx.prisma.$queryRaw<
          {
            userId: string;
            firstTrace: Date;
            lastTrace: Date;
            totalTraces: bigint;
            totalPromptTokens: bigint;
            totalCompletionTokens: bigint;
            totalTokens: bigint;
            firstObservation: Date;
            lastObservation: Date;
            totalObservations: bigint;
            sumCalculatedTotalCost: number;
          }[]
        >`
          SELECT 
            t.user_id "userId",
            min(t."timestamp") "firstTrace",
            max(t."timestamp") "lastTrace",
            COUNT(distinct t.id)::bigint "totalTraces",
            COALESCE(SUM(o.prompt_tokens),0)::bigint "totalPromptTokens",
            COALESCE(SUM(o.completion_tokens),0)::bigint "totalCompletionTokens",
            COALESCE(SUM(o.total_tokens),0)::bigint "totalTokens",
            MIN(o.start_time) "firstObservation",
            MAX(o.start_time) "lastObservation",
            COUNT(distinct o.id)::bigint "totalObservations",
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
        `,
        // lastScoresOfUsers
        ctx.prisma.$queryRaw<Array<LastUserScore>>`
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
          "comment",
          "source",
          data_type "dataType",
          "string_value" "stringValue"
        FROM
          ranked_scores
        WHERE rn = 1
        `,
      ]);

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
