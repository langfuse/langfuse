import { z } from "zod/v4";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { applyCommentFilters } from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedGetSessionProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterAndValidateDbScoreList,
  type FilterState,
  type OrderByState,
  orderBy,
  paginationZod,
  type PrismaClient,
  singleFilter,
  timeFilter,
  type SessionOptions,
  type ScoreDomain,
  AGGREGATABLE_SCORE_TYPES,
} from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import {
  traceException,
  getSessionsTable,
  getSessionsTableCount,
  getSessionsTableFromEvents,
  getSessionsTableCountFromEvents,
  getSessionMetricsFromEvents,
  getSessionTracesFromEvents,
  getObservationsWithModelDataFromEventsTable,
  getTracesGroupedByTags,
  getTracesIdentifierForSession,
  getScoresForTraces,
  getCostForTraces,
  getTracesGroupedByUsers,
  getPublicSessionsFilter,
  logger,
  getSessionsWithMetrics,
  hasAnySession,
  getScoresForSessions,
  getNumericScoresGroupedByName,
  getCategoricalScoresGroupedByName,
  tracesTableUiColumnDefinitions,
  getEventsGroupedByUserId,
  getEventsGroupedByTraceTags,
  hasAnySessionFromEventsTable,
} from "@langfuse/shared/src/server";
import chunk from "lodash/chunk";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { toDomainArrayWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});

const SessionTraceObservationsInput = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  filter: z.array(singleFilter).nullable(),
});

const handleGetSessionById = async (input: {
  sessionId: string;
  projectId: string;
  ctx: {
    prisma: PrismaClient;
  };
}) => {
  const postgresSession = await input.ctx.prisma.traceSession.findFirst({
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

  const chunks = chunk(clickhouseTraces, 500);

  // in the below queries, take the lowest timestamp as a filter condition
  // to improve performance
  const [scores, costs] = await Promise.all([
    Promise.all(
      chunks.map((chunk) =>
        getScoresForTraces({
          projectId: input.projectId,
          traceIds: chunk.map((t) => t.id),
          timestamp: new Date(
            Math.min(...chunk.map((t) => t.timestamp.getTime())),
          ),
        }),
      ),
    ).then((results) => results.flat()),
    Promise.all(
      chunks.map((chunk) =>
        getCostForTraces(
          input.projectId,
          new Date(Math.min(...chunk.map((t) => t.timestamp.getTime()))),
          chunk.map((t) => t.id),
        ),
      ),
    ).then((results) =>
      results.reduce((sum, cost) => (sum ?? 0) + (cost ?? 0), 0),
    ),
  ]);

  const costData = costs;

  const validatedScores = filterAndValidateDbScoreList({
    scores,
    dataTypes: AGGREGATABLE_SCORE_TYPES,
    onParseError: traceException,
  });

  return {
    ...postgresSession,
    traces: clickhouseTraces.map((t) => ({
      ...t,
      scores: toDomainArrayWithStringifiedMetadata(
        validatedScores.filter((s) => s.traceId === t.id),
      ),
    })),
    totalCost: costData ?? 0,
    users: [
      ...new Set(
        clickhouseTraces.map((t) => t.userId).filter((t) => t !== null),
      ),
    ],
  };
};

export const sessionRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return await hasAnySession(input.projectId);
    }),
  hasAnyFromEvents: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return await hasAnySessionFromEventsTable(input.projectId);
    }),
  all: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "SESSION",
      });

      if (hasNoMatches) {
        return { sessions: [] };
      }

      const finalFilter = await getPublicSessionsFilter(
        input.projectId,
        filterState,
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
          environment: true,
        },
      });
      return {
        sessions: sessions.map((s) => {
          return {
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
            environment: s.trace_environment,
          };
        }),
      };
    }),
  allFromEvents: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "SESSION",
      });

      if (hasNoMatches) {
        return { sessions: [] };
      }

      const finalFilter = await getPublicSessionsFilter(
        input.projectId,
        filterState,
      );
      const sessions = await getSessionsTableFromEvents({
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
        sessions: sessions.map((s) => {
          return {
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
            environment: s.environment,
          };
        }),
      };
    }),
  countAll: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "SESSION",
      });

      if (hasNoMatches) {
        return { totalCount: 0 };
      }

      const finalFilter = await getPublicSessionsFilter(
        input.projectId,
        filterState,
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
    }),
  countAllFromEvents: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: input.projectId,
        objectType: "SESSION",
      });

      if (hasNoMatches) {
        return { totalCount: 0 };
      }

      const finalFilter = await getPublicSessionsFilter(
        input.projectId,
        filterState,
      );
      const count = await getSessionsTableCountFromEvents({
        projectId: input.projectId,
        filter: finalFilter,
        orderBy: input.orderBy,
        page: 0,
        limit: 1,
      });

      return {
        totalCount: count,
      };
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.sessionIds.length === 0) return [];
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

      const scores = await getScoresForSessions({
        projectId: ctx.session.projectId,
        sessionIds: sessions.map((s) => s.session_id),
        limit: 1000,
        offset: 0,
      });

      const validatedScores = filterAndValidateDbScoreList({
        scores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return sessions.map((s) => ({
        id: s.session_id,
        userIds: s.user_ids,
        countTraces: s.trace_count,
        traceTags: s.trace_tags,
        createdAt: new Date(s.min_timestamp),
        bookmarked:
          prismaSessionInfo.find((p) => p.id === s.session_id)?.bookmarked ??
          false,
        public:
          prismaSessionInfo.find((p) => p.id === s.session_id)?.public ?? false,
        environment: s.trace_environment,
        trace_count: Number(s.trace_count),
        total_observations: Number(s.total_observations),
        sessionDuration: Number(s.duration),
        inputCost: new Decimal(s.session_input_cost),
        outputCost: new Decimal(s.session_output_cost),
        totalCost: new Decimal(s.session_total_cost),
        promptTokens: Number(s.session_input_usage),
        completionTokens: Number(s.session_output_usage),
        totalTokens: Number(s.session_total_usage),
        scores: aggregateScores(
          validatedScores.filter((score) => score.sessionId === s.session_id),
        ),
      }));
    }),
  metricsFromEvents: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionIds: z.array(z.string()),
        queryFromTimestamp: z.date().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.sessionIds.length === 0) return [];
      const sessions = await getSessionMetricsFromEvents({
        projectId: input.projectId,
        sessionIds: input.sessionIds,
        queryFromTimestamp: input.queryFromTimestamp ?? undefined,
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

      const scores = await getScoresForSessions({
        projectId: ctx.session.projectId,
        sessionIds: sessions.map((s) => s.session_id),
        limit: 1000,
        offset: 0,
      });

      const validatedScores = filterAndValidateDbScoreList({
        scores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return sessions.map((s) => ({
        id: s.session_id,
        userIds: s.user_ids,
        countTraces: s.trace_count,
        traceTags: s.trace_tags,
        createdAt: new Date(s.min_timestamp),
        bookmarked:
          prismaSessionInfo.find((p) => p.id === s.session_id)?.bookmarked ??
          false,
        public:
          prismaSessionInfo.find((p) => p.id === s.session_id)?.public ?? false,
        environment: s.environment,
        trace_count: Number(s.trace_count),
        total_observations: Number(s.total_observations),
        sessionDuration: Number(s.duration),
        inputCost: new Decimal(s.session_input_cost),
        outputCost: new Decimal(s.session_output_cost),
        totalCost: new Decimal(s.session_total_cost),
        promptTokens: Number(s.session_input_usage),
        completionTokens: Number(s.session_output_usage),
        totalTokens: Number(s.session_total_usage),
        scores: aggregateScores(
          validatedScores.filter((score) => score.sessionId === s.session_id),
        ),
      }));
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: z.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input }): Promise<SessionOptions> => {
      const { timestampFilter } = input;
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
      if (timestampFilter && timestampFilter.length > 0) {
        filter.push(...timestampFilter);
      }
      // Create a proper trace timestamp filter for score functions
      const scoreTimestampFilter =
        timestampFilter && timestampFilter.length > 0
          ? timestampFilter.map((tf) => ({
              ...tf,
              column: "Timestamp", // Use exact trace column name for score functions
            }))
          : [];

      const [userIds, tags, numericScoreNames, categoricalScoreNames] =
        await Promise.all([
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
          getNumericScoresGroupedByName(input.projectId, scoreTimestampFilter),
          getCategoricalScoresGroupedByName(
            input.projectId,
            scoreTimestampFilter,
          ),
        ]);

      return {
        userIds: userIds.map((row) => ({
          value: row.user,
          count: Number(row.count),
        })),
        environment: [], // Environment is fetched separately via api.projects.environmentFilterOptions
        tags: tags,
        scores_avg: numericScoreNames.map((s) => s.name),
        score_categories: categoricalScoreNames,
      };
    }),
  filterOptionsFromEvents: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: z.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input }): Promise<SessionOptions> => {
      const { timestampFilter } = input;

      const eventsFilter: FilterState = [
        {
          column: "sessionId",
          operator: "is not null",
          type: "null",
          value: "",
        },
      ];

      if (timestampFilter && timestampFilter.length > 0) {
        eventsFilter.push(
          ...timestampFilter.map((tf) => ({
            ...tf,
            column: "startTime" as const,
          })),
        );
      }

      const scoreTimestampFilter =
        timestampFilter && timestampFilter.length > 0
          ? timestampFilter.map((tf) => ({
              ...tf,
              column: "Timestamp", // Use exact trace column name for score functions
            }))
          : [];

      const [userIds, tags, numericScoreNames, categoricalScoreNames] =
        await Promise.all([
          getEventsGroupedByUserId(input.projectId, eventsFilter),
          getEventsGroupedByTraceTags(input.projectId, eventsFilter),
          getNumericScoresGroupedByName(input.projectId, scoreTimestampFilter),
          getCategoricalScoresGroupedByName(
            input.projectId,
            scoreTimestampFilter,
          ),
        ]);

      return {
        userIds: userIds.map((row) => ({
          value: row.userId,
          count: Number(row.count),
        })),
        environment: [], // Environment is fetched separately via api.projects.environmentFilterOptions
        tags: tags.map((row) => ({
          value: row.tag,
        })),
        scores_avg: numericScoreNames.map((s) => s.name),
        score_categories: categoricalScoreNames,
      };
    }),
  byIdWithScores: protectedGetSessionProcedure
    .input(
      z.object({
        sessionId: z.string(), // used for security check
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input, ctx }) => {
      const [scores, session] = await Promise.all([
        getScoresForSessions({
          projectId: input.projectId,
          sessionIds: [input.sessionId],
        }),
        handleGetSessionById({
          sessionId: input.sessionId,
          projectId: input.projectId,
          ctx,
        }),
      ]);

      const validatedScores: ScoreDomain[] = filterAndValidateDbScoreList({
        scores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return {
        ...session,
        scores: toDomainArrayWithStringifiedMetadata(validatedScores),
      };
    }),
  byIdWithScoresFromEvents: protectedGetSessionProcedure
    .input(
      z.object({
        sessionId: z.string(), // used for security check
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input, ctx }) => {
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

      const [scores, sessionMetrics] = await Promise.all([
        getScoresForSessions({
          projectId: input.projectId,
          sessionIds: [input.sessionId],
        }),
        getSessionMetricsFromEvents({
          projectId: input.projectId,
          sessionIds: [input.sessionId],
        }).then((rows) => rows[0]),
      ]);

      const validatedScores: ScoreDomain[] = filterAndValidateDbScoreList({
        scores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return {
        ...postgresSession,
        users:
          sessionMetrics?.user_ids?.filter(
            (userId) => userId !== null && userId !== "",
          ) ?? [],
        countTraces: sessionMetrics?.trace_count ?? 0,
        totalCost: sessionMetrics
          ? Number(sessionMetrics.session_total_cost)
          : 0,
        environment: sessionMetrics?.environment,
        scores: toDomainArrayWithStringifiedMetadata(validatedScores),
      };
    }),
  tracesFromEvents: protectedGetSessionProcedure
    .input(
      z.object({
        sessionId: z.string(), // used for security check
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input }) => {
      const traces = await getSessionTracesFromEvents({
        projectId: input.projectId,
        sessionId: input.sessionId,
      });

      const chunks = chunk(traces, 500);
      const scores = await Promise.all(
        chunks.map((traceChunk) =>
          getScoresForTraces({
            projectId: input.projectId,
            traceIds: traceChunk.map((t) => t.id),
            timestamp: new Date(
              Math.min(...traceChunk.map((t) => t.timestamp.getTime())),
            ),
          }),
        ),
      ).then((results) => results.flat());

      const validatedScores = filterAndValidateDbScoreList({
        scores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return traces.map((trace) => ({
        ...trace,
        scores: toDomainArrayWithStringifiedMetadata(
          validatedScores.filter((s) => s.traceId === trace.id),
        ),
      }));
    }),
  observationsForTraceFromEvents: protectedGetSessionProcedure
    .input(SessionTraceObservationsInput)
    .query(async ({ input }) => {
      const positionFilter = (input.filter ?? []).find(
        (filter) => filter.type === "positionInTrace",
      );
      const baseFilters = (input.filter ?? []).filter(
        (filter) => filter.type !== "positionInTrace",
      );

      const filterState: FilterState = [
        ...baseFilters,
        {
          column: "traceId",
          type: "string",
          operator: "=",
          value: input.traceId,
        },
        {
          column: "sessionId",
          type: "string",
          operator: "=",
          value: input.sessionId,
        },
      ];

      let orderBy: OrderByState = { column: "startTime", order: "ASC" };
      let limit: number | undefined;
      let offset: number | undefined;

      if (positionFilter) {
        if (positionFilter.key === "root") {
          filterState.push({
            column: "hasParentObservation",
            type: "boolean",
            operator: "=",
            value: false,
          });
          orderBy = { column: "startTime", order: "ASC" };
          limit = 1;
        } else {
          const fromEnd =
            positionFilter.key === "last" ||
            positionFilter.key === "nthFromEnd";
          orderBy = { column: "startTime", order: fromEnd ? "DESC" : "ASC" };
          const rawIndex =
            positionFilter.key === "last" ? 1 : (positionFilter.value ?? 1);
          const safeIndex = Math.max(1, rawIndex);
          offset = safeIndex - 1;
          limit = 1;
        }
      }

      const observations = await getObservationsWithModelDataFromEventsTable({
        projectId: input.projectId,
        filter: filterState,
        searchQuery: undefined,
        searchType: [],
        orderBy,
        limit,
        offset,
        selectIOAndMetadata: true,
        renderingProps: { truncated: true, shouldJsonParse: true },
      });

      return observations;
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
    }),
});
