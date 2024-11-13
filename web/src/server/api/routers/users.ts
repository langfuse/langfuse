import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, singleFilter } from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";
import {
  getTotalUserCount,
  getUserMetrics,
  getUsersAndTraceCount,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared/src/server";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { TRPCError } from "@trpc/server";

const UserFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  searchQuery: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
});

const UserAllOptions = UserFilterOptions.extend({
  ...paginationZod,
});

export const userRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      UserAllOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return measureAndReturnApi({
        input,
        operation: "users.all",
        user: ctx.session.user,
        pgExecution: async () => {
          const filterCondition = tableColumnsToSqlFilterAndPrefix(
            input.filter ?? [],
            usersTableCols,
            "users",
          );

          const searchCondition = input.searchQuery
            ? Prisma.sql`AND t.user_id ILIKE ${`%${input.searchQuery}%`}`
            : Prisma.empty;

          const [users, totalUsers] = await Promise.all([
            ctx.prisma.$queryRaw<
              Array<{ userId: string; totalTraces: bigint }>
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
                ${searchCondition}
              GROUP BY
                t.user_id
              ORDER BY
                "totalTraces" DESC
              LIMIT
                ${input.limit} OFFSET ${input.page * input.limit};
            `,
            ctx.prisma.$queryRaw<Array<{ totalCount: bigint }>>`
              SELECT COUNT(DISTINCT t.user_id)::bigint AS "totalCount"
              FROM traces t
              WHERE t.project_id = ${input.projectId}
              ${filterCondition}
              ${searchCondition}
            `,
          ]);

          return {
            totalUsers: totalUsers[0].totalCount,
            users,
          };
        },
        clickhouseExecution: async () => {
          const [users, totalUsers] = await Promise.all([
            getUsersAndTraceCount(
              ctx.session.projectId,
              input.filter ?? [],
              input.searchQuery ?? undefined,
              input.limit,
              input.page,
            ),
            getTotalUserCount(
              ctx.session.projectId,
              input.filter ?? [],
              input.searchQuery ?? undefined,
            ),
          ]);

          return {
            totalUsers: totalUsers.shift()?.totalCount ?? 0,
            users,
          };
        },
      });
    }),

  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userIds: z.array(z.string().min(1)),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return measureAndReturnApi({
        input,
        operation: "users.metrics",
        user: ctx.session.user,
        pgExecution: async () => {
          if (input.userIds.length === 0) {
            return [];
          }
          return ctx.prisma.$queryRaw<
            Array<{
              userId: string;
              firstTrace: Date | null;
              lastTrace: Date | null;
              totalPromptTokens: bigint;
              totalCompletionTokens: bigint;
              totalTokens: bigint;
              totalObservations: bigint;
              totalTraces: bigint;
              sumCalculatedTotalCost: number;
            }>
          >`
            SELECT t.user_id                                     AS "userId",
                   MIN(t."timestamp")                            AS "firstTrace",
                   MAX(t."timestamp")                            AS "lastTrace",
                   COALESCE(SUM(o.prompt_tokens), 0)::bigint     AS "totalPromptTokens",
                   COALESCE(SUM(o.completion_tokens), 0)::bigint AS "totalCompletionTokens",
                   COALESCE(SUM(o.total_tokens), 0)::bigint      AS "totalTokens",
                   COUNT(o."totalObservations")::bigint          AS "totalObservations",
                   (COUNT(*) OVER ())::bigint                    AS "totalTraces",
                   SUM(COALESCE(ov.calculated_total_cost, 0))    AS "sumCalculatedTotalCost"
            FROM traces t
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(o.prompt_tokens), 0)::bigint     AS "prompt_tokens",
                     COALESCE(SUM(o.completion_tokens), 0)::bigint AS "completion_tokens",
                     COALESCE(SUM(o.total_tokens), 0)::bigint      AS "total_tokens",
                     COUNT(DISTINCT o.id)::bigint                  AS "totalObservations"
              FROM observations o
              WHERE o.trace_id = t.id
                AND o.project_id = ${input.projectId}
              GROUP BY t.user_id
            ) o ON TRUE
            LEFT JOIN LATERAL (
              SELECT SUM(COALESCE(ov.calculated_total_cost, 0)) AS "calculated_total_cost"
              FROM observations_view ov
              WHERE ov.trace_id = t.id
                AND ov."type" = 'GENERATION'
                AND ov.project_id = ${input.projectId}
              GROUP BY t.user_id
            ) ov ON TRUE
            WHERE t.user_id IN (${Prisma.join(input.userIds)})
            AND t.project_id = ${input.projectId}
            GROUP BY 1;
          `;
        },
        clickhouseExecution: async () => {
          if (input.userIds.length === 0) {
            return [];
          }
          return getUserMetrics(input.projectId, input.userIds);
        },
      });
    }),

  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return measureAndReturnApi({
        input,
        operation: "users.byId",
        user: ctx.session.user,
        pgExecution: async () => {
          const result = await ctx.prisma.$queryRaw<
            {
              userId: string;
              firstTrace: Date;
              lastTrace: Date;
              totalTraces: bigint;
              totalPromptTokens: bigint;
              totalCompletionTokens: bigint;
              totalTokens: bigint;
              totalObservations: bigint;
              sumCalculatedTotalCost: number;
            }[]
          >`
            SELECT t.user_id                                     "userId",
                   min(t."timestamp")                            "firstTrace",
                   max(t."timestamp")                            "lastTrace",
                   COUNT(distinct t.id)::bigint                  "totalTraces",
                   COALESCE(SUM(o.prompt_tokens), 0)::bigint     "totalPromptTokens",
                   COALESCE(SUM(o.completion_tokens), 0)::bigint "totalCompletionTokens",
                   COALESCE(SUM(o.total_tokens), 0)::bigint      "totalTokens",
                   COUNT(distinct o.id)::bigint                  "totalObservations",
                   SUM(COALESCE(o.calculated_total_cost, 0)) AS  "sumCalculatedTotalCost"
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

          return {
            userId: input.userId,
            firstTrace: result[0]?.firstTrace,
            lastTrace: result[0]?.lastTrace,
            totalTraces: result[0]?.totalTraces ?? 0,
            totalPromptTokens: result[0]?.totalPromptTokens ?? 0,
            totalCompletionTokens: result[0]?.totalCompletionTokens ?? 0,
            totalTokens: result[0]?.totalTokens ?? 0,
            totalObservations: result[0]?.totalObservations ?? 0,
            sumCalculatedTotalCost: result[0]?.sumCalculatedTotalCost ?? 0,
          };
        },
        clickhouseExecution: async () => {
          const result = (
            await getUserMetrics(input.projectId, [input.userId])
          ).shift();
          return {
            userId: input.userId,
            firstTrace: result?.firstTrace,
            lastTrace: result?.lastTrace,
            totalTraces: result?.totalTraces ?? 0,
            totalPromptTokens: result?.totalPromptTokens ?? 0,
            totalCompletionTokens: result?.totalCompletionTokens ?? 0,
            totalTokens: result?.totalTokens ?? 0,
            totalObservations: result?.totalObservations ?? 0,
            sumCalculatedTotalCost: result?.sumCalculatedTotalCost ?? 0,
          };
        },
      });
    }),
});
