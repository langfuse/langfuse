import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedGetSessionProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterAndValidateDbScoreList,
  orderBy,
  paginationZod,
  type SessionOptions,
  singleFilter,
  timeFilter,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";
import Decimal from "decimal.js";
import {
  createSessionsAllQuery,
  datetimeFilterToPrismaSql,
  traceException,
  getSessionsTable,
  getSessionsTableCount,
  getTracesGroupedByUserIds,
  getTracesGroupedByTags,
  getTracesForSession,
  getScoresForTraces,
  getCostForTraces,
} from "@langfuse/shared/src/server";

const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});

export const sessionRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      SessionFilterOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        if (input.queryClickhouse) {
          const sessions = await getSessionsTable({
            projectId: input.projectId,
            filter: input.filter ?? [],
            orderBy: input.orderBy,
            offset: input.page * input.limit,
            limit: input.limit,
          });

          const prismaSessionInfo = await ctx.prisma.traceSession.findMany({
            where: {
              id: {
                in: sessions.map((s) => s.session_id),
              },
              projectId: input.projectId,
            },
            select: {
              id: true,
              bookmarked: true,
              public: true,
            },
          });
          return {
            sessions: sessions.map((s) => ({
              id: s.session_id,
              userIds: s.user_ids,
              countTraces: s.trace_ids.length,
              sessionDuration: Number(s.duration),
              inputCost: new Decimal(s.session_input_cost),
              outputCost: new Decimal(s.session_output_cost),
              totalCost: new Decimal(s.session_total_cost),
              promptTokens: Number(s.session_input_usage),
              completionTokens: Number(s.session_output_usage),
              totalTokens: Number(s.session_total_usage),
              traceTags: s.trace_tags,
              createdAt: s.min_timestamp,
              bookmarked:
                prismaSessionInfo.find((p) => p.id === s.session_id)
                  ?.bookmarked ?? false,
              public: prismaSessionInfo.find((p) => p.id === s.session_id)
                ?.public,
            })),
          };
        }

        const sessions = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            createdAt: Date;
            bookmarked: boolean;
            public: boolean;
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
              s.id,
              s."created_at" AS "createdAt",
              s.bookmarked,
              s.public
            `,
            input,
          ),
        );

        return {
          sessions,
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get sessions",
        });
      }
    }),
  countAll: protectedProjectProcedure
    .input(
      SessionFilterOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        if (input.queryClickhouse) {
          const counts = await getSessionsTableCount({
            projectId: input.projectId,
            filter: input.filter ?? [],
            orderBy: input.orderBy,
            offset: input.page * input.limit,
            limit: input.limit,
          });

          return {
            totalCount: counts.length > 0 ? counts[0].count : 0,
          };
        }

        const inputForTotal: z.infer<typeof SessionFilterOptions> = {
          filter: input.filter,
          projectId: input.projectId,
          orderBy: null,
          limit: 1,
          page: 0,
        };

        const totalCount = await ctx.prisma.$queryRaw<
          Array<{
            totalCount: number;
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
                count(*)::int as "totalCount"
              `,
            inputForTotal,
            {
              ignoreOrderBy: true,
            },
          ),
        );

        return {
          totalCount: totalCount[0].totalCount,
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session count",
        });
      }
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionIds: z.array(z.string()),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        if (input.sessionIds.length === 0) return [];

        if (input.queryClickhouse) {
          return []; // initial endpoint returns all data from CH.
        }

        const inputForMetrics: z.infer<typeof SessionFilterOptions> = {
          filter: [],
          projectId: input.projectId,
          orderBy: null,
          limit: 10000, // no limit
          page: 0,
        };

        const metrics = await ctx.prisma.$queryRaw<
          Array<{
            id: string;
            countTraces: number;
            userIds: (string | null)[] | null;
            sessionDuration: number | null;
            inputCost: Decimal;
            outputCost: Decimal;
            totalCost: Decimal;
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            traceTags: string[];
          }>
        >(
          createSessionsAllQuery(
            Prisma.sql`
              s.id,
              t."userIds",
              t."countTraces",
              o."sessionDuration",
              o."totalCost" AS "totalCost",
              o."inputCost" AS "inputCost",
              o."outputCost" AS "outputCost",
              o."promptTokens" AS "promptTokens",
              o."completionTokens" AS "completionTokens",
              o."totalTokens" AS "totalTokens",
              t."tags" AS "traceTags"
            `,
            inputForMetrics,
            {
              ignoreOrderBy: true,
              sessionIdList: input.sessionIds,
            },
          ),
        );

        return metrics.map((row) => ({
          ...row,
          userIds: (row.userIds?.filter((t) => t !== null) ?? []) as string[],
          traceTags: (row.traceTags?.filter((t) => t !== null) ??
            []) as string[],
        }));
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session metrics",
        });
      }
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: timeFilter.optional(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const { timestampFilter } = input;

        if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        if (input.queryClickhouse) {
          const columns = [
            ...tracesTableUiColumnDefinitions,
            {
              uiTableName: "Created At",
              uiTableId: "createdAt",
              clickhouseTableName: "traces",
              clickhouseSelect: "timestamp",
            },
          ];
          const [userIds, tags] = await Promise.all([
            getTracesGroupedByUserIds({
              projectId: input.projectId,
              filter: timestampFilter ? [timestampFilter] : [],
              sessionIdNullFilter: true,
              columns,
            }),
            getTracesGroupedByTags({
              projectId: input.projectId,
              filter: timestampFilter ? [timestampFilter] : [],
              sessionIdNullFilter: true,
              columns,
            }),
          ]);

          return {
            userIds: userIds.map((row) => ({
              value: row.user_id,
            })),
            tags: tags.map((row) => ({
              value: row.value,
            })),
          };
        }

        const rawTimestampFilter =
          timestampFilter && timestampFilter.type === "datetime"
            ? datetimeFilterToPrismaSql(
                "timestamp",
                timestampFilter.operator,
                timestampFilter.value,
              )
            : Prisma.empty;
        const [userIds, tags] = await Promise.all([
          ctx.prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
            SELECT 
              traces.user_id AS value
            FROM traces
            WHERE 
              traces.session_id IS NOT NULL
              AND traces.user_id IS NOT NULL
              AND traces.project_id = ${input.projectId} ${rawTimestampFilter}
            GROUP BY traces.user_id 
            ORDER BY traces.user_id ASC
            LIMIT 1000;
          `),
          ctx.prisma.$queryRaw<
            Array<{
              value: string;
            }>
          >(Prisma.sql`
            SELECT DISTINCT tag AS value
            FROM traces t
            JOIN observations o ON o.trace_id = t.id,
            UNNEST(t.tags) AS tag
            WHERE o.type = 'GENERATION'
              AND o.project_id = ${input.projectId}
              AND t.project_id = ${input.projectId} ${rawTimestampFilter}
            LIMIT 1000;
          `),
        ]);

        const res: SessionOptions = {
          userIds: userIds,
          tags: tags,
        };
        return res;
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session filter options",
        });
      }
    }),
  byId: protectedGetSessionProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        if (input.queryClickhouse && !isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        if (input.queryClickhouse) {
          const postgresSession = await ctx.prisma.traceSession.findFirst({
            where: {
              id: input.sessionId,
              projectId: input.projectId,
            },
          });

          if (!postgresSession) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Session not found in project",
            });
          }

          const clickhouseTraces = await getTracesForSession(
            input.projectId,
            input.sessionId,
          );

          const [scores, costData] = await Promise.all([
            getScoresForTraces(
              input.projectId,
              clickhouseTraces.map((t) => t.id),
            ),
            getCostForTraces(
              input.projectId,
              clickhouseTraces.map((t) => t.id),
            ),
          ]);

          const validatedScores = filterAndValidateDbScoreList(
            scores,
            traceException,
          );

          return {
            ...postgresSession,
            traces: clickhouseTraces.map((t) => ({
              ...t,
              scores: validatedScores.filter((s) => s.traceId === t.id),
            })),
            totalCost: costData,
            users: [
              ...new Set(
                clickhouseTraces.map((t) => t.userId).filter((t) => t !== null),
              ),
            ],
          };
        }

        const session = await ctx.prisma.traceSession.findFirst({
          where: {
            id: input.sessionId,
            projectId: input.projectId,
          },
          include: {
            traces: {
              orderBy: {
                timestamp: "asc",
              },
              select: {
                id: true,
                userId: true,
                name: true,
                timestamp: true,
              },
            },
          },
        });
        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found in project",
          });
        }

        const totalCostQuery = Prisma.sql`
          SELECT
            SUM(COALESCE(o."calculated_total_cost", 0)) AS "totalCost"
          FROM observations_view o
          JOIN traces t ON t.id = o.trace_id
          WHERE
            t."session_id" = ${input.sessionId}
            AND t."project_id" = ${input.projectId}
        `;

        const [scores, costData] = await Promise.all([
          ctx.prisma.score.findMany({
            where: {
              traceId: {
                in: session.traces.map((t) => t.id),
              },
              projectId: input.projectId,
            },
          }),
          // costData
          ctx.prisma.$queryRaw<Array<{ totalCost: number }>>(totalCostQuery),
        ]);

        const validatedScores = filterAndValidateDbScoreList(
          scores,
          traceException,
        );

        return {
          ...session,
          traces: session.traces.map((t) => ({
            ...t,
            scores: validatedScores.filter((s) => s.traceId === t.id),
          })),
          totalCost: costData[0].totalCost ?? 0,
          users: [
            ...new Set(
              session.traces.map((t) => t.userId).filter((t) => t !== null),
            ),
          ],
        };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get session",
        });
      }
    }),
  bookmark: protectedProjectProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        bookmarked: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "objects:bookmark",
        });

        await auditLog({
          session: ctx.session,
          resourceType: "session",
          resourceId: input.sessionId,
          action: "bookmark",
          after: input.bookmarked,
        });

        const session = await ctx.prisma.traceSession.update({
          where: {
            id_projectId: {
              id: input.sessionId,
              projectId: input.projectId,
            },
          },
          data: {
            bookmarked: input.bookmarked,
          },
        });
        return session;
      } catch (error) {
        console.error(error);
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025" // Record to update not found
        )
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found in project",
          });
        else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        }
      }
    }),
  publish: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
        public: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "objects:publish",
        });
        await auditLog({
          session: ctx.session,
          resourceType: "session",
          resourceId: input.sessionId,
          action: "publish",
          after: input.public,
        });
        return ctx.prisma.traceSession.update({
          where: {
            id_projectId: {
              id: input.sessionId,
              projectId: input.projectId,
            },
          },
          data: {
            public: input.public,
          },
        });
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to publish session",
        });
      }
    }),
});
