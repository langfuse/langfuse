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
  type FilterState,
  orderBy,
  paginationZod,
  type SessionOptions,
  singleFilter,
  timeFilter,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import Decimal from "decimal.js";
import {
  createSessionsAllQuery,
  datetimeFilterToPrismaSql,
  traceException,
  getSessionsTable,
  getSessionsTableCount,
  getTracesGroupedByTags,
  getTracesIdentifierForSession,
  getScoresForTraces,
  getCostForTraces,
  getTracesGroupedByUsers,
  getPublicSessionsFilter,
  logger,
  getSessionsWithMetrics,
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
        return await measureAndReturnApi({
          input,
          operation: "sessions.all",
          user: ctx.session.user,
          pgExecution: async () => {
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
          },
          clickhouseExecution: async () => {
            const finalFilter = await getPublicSessionsFilter(
              input.projectId,
              input.filter ?? [],
            );
            const sessions = await getSessionsTable({
              projectId: input.projectId,
              filter: finalFilter,
              orderBy: input.orderBy,
              page: input.page,
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
                countTraces: s.trace_count,
                traceTags: s.trace_tags,
                createdAt: new Date(s.min_timestamp),
                bookmarked:
                  prismaSessionInfo.find((p) => p.id === s.session_id)
                    ?.bookmarked ?? false,
                public:
                  prismaSessionInfo.find((p) => p.id === s.session_id)
                    ?.public ?? false,
              })),
            };
          },
        });
      } catch (e) {
        logger.error("Unable to call sessions.all", e);
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
        return await measureAndReturnApi({
          input,
          operation: "sessions.countAll",
          user: ctx.session.user,
          pgExecution: async () => {
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
          },
          clickhouseExecution: async () => {
            const finalFilter = await getPublicSessionsFilter(
              input.projectId,
              input.filter ?? [],
            );
            const count = await getSessionsTableCount({
              projectId: input.projectId,
              filter: finalFilter,
              orderBy: input.orderBy,
              page: 0,
              limit: 1,
            });

            return {
              totalCount: count,
            };
          },
        });
      } catch (e) {
        logger.error("Error in sessions.countAll", e);
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
        if (input.sessionIds.length === 0) return [];
        return await measureAndReturnApi({
          input,
          operation: "traces.metrics",
          user: ctx.session.user,
          pgExecution: async () => {
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
              userIds: (row.userIds?.filter((t) => t !== null) ??
                []) as string[],
              traceTags: (row.traceTags?.filter((t) => t !== null) ??
                []) as string[],
            }));
          },
          clickhouseExecution: async () => {
            const finalFilter = await getPublicSessionsFilter(input.projectId, [
              {
                column: "id",
                type: "stringOptions",
                operator: "any of",
                value: input.sessionIds,
              },
            ]);
            const sessions = await getSessionsWithMetrics({
              projectId: input.projectId,
              filter: finalFilter,
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

            return sessions.map((s) => ({
              id: s.session_id,
              userIds: s.user_ids,
              countTraces: s.trace_count,
              traceTags: s.trace_tags,
              createdAt: new Date(s.min_timestamp),
              bookmarked:
                prismaSessionInfo.find((p) => p.id === s.session_id)
                  ?.bookmarked ?? false,
              public:
                prismaSessionInfo.find((p) => p.id === s.session_id)?.public ??
                false,
              trace_count: Number(s.trace_count),
              total_observations: Number(s.total_observations),
              sessionDuration: Number(s.duration) / 1000,
              inputCost: new Decimal(s.session_input_cost),
              outputCost: new Decimal(s.session_output_cost),
              totalCost: new Decimal(s.session_total_cost),
              promptTokens: Number(s.session_input_usage),
              completionTokens: Number(s.session_output_usage),
              totalTokens: Number(s.session_total_usage),
            }));
          },
        });
      } catch (e) {
        logger.error("Error in sessions.metrics", e);
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
        return await measureAndReturnApi({
          input,
          operation: "sessions.filterOptions",
          user: ctx.session.user,
          pgExecution: async () => {
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
          },
          clickhouseExecution: async () => {
            const columns = [
              ...tracesTableUiColumnDefinitions,
              {
                uiTableName: "Created At",
                uiTableId: "createdAt",
                clickhouseTableName: "traces",
                clickhouseSelect: "timestamp",
              },
            ];
            const filter: FilterState = [
              {
                column: "sessionId",
                operator: "is not null",
                type: "null",
                value: "",
              },
            ];
            if (timestampFilter) {
              filter.push(timestampFilter);
            }
            const [userIds, tags] = await Promise.all([
              getTracesGroupedByUsers(
                input.projectId,
                filter,
                undefined,
                1000,
                0,
                columns,
              ),
              getTracesGroupedByTags({
                projectId: input.projectId,
                filter,
                columns,
              }),
            ]);

            return {
              userIds: userIds.map((row) => ({
                value: row.user,
              })),
              tags: tags.map((row) => ({
                value: row.value,
              })),
            };
          },
        });
      } catch (e) {
        logger.error("Unable to get sessions.filterOptions", e);
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
        return await measureAndReturnApi({
          input,
          operation: "sessions.byId",
          user: ctx.session.user ?? undefined,
          pgExecution: async () => {
            const session = null;

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
              ctx.prisma.$queryRaw<Array<{ totalCost: number }>>(
                totalCostQuery,
              ),
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
          },
          clickhouseExecution: async () => {
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

            const clickhouseTraces = await getTracesIdentifierForSession(
              input.projectId,
              input.sessionId,
            );

            const traceIds = clickhouseTraces.map((t) => t.id);
            const chunkSize = 500;
            const chunks = [];

            for (let i = 0; i < traceIds.length; i += chunkSize) {
              chunks.push(traceIds.slice(i, i + chunkSize));
            }

            const [scores, costs] = await Promise.all([
              Promise.all(
                chunks.map((chunk) =>
                  getScoresForTraces({
                    projectId: input.projectId,
                    traceIds: chunk,
                  }),
                ),
              ).then((results) => results.flat()),
              Promise.all(
                chunks.map((chunk) => getCostForTraces(input.projectId, chunk)),
              ).then((results) =>
                results.reduce((sum, cost) => (sum ?? 0) + (cost ?? 0), 0),
              ),
            ]);

            const costData = costs;

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
              totalCost: costData ?? 0,
              users: [
                ...new Set(
                  clickhouseTraces
                    .map((t) => t.userId)
                    .filter((t) => t !== null),
                ),
              ],
            };
          },
        });
      } catch (e) {
        logger.error("Unable to get sessions.byId", e);
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
        logger.error("Unable to call sessions.bookmark", error);
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
        logger.error("Unable to call sessions.publish", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to publish session",
        });
      }
    }),
});
