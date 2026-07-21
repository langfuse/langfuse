import { z } from "zod";
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
  normalizeOrderByForTable,
  orderBy,
  paginationZod,
  type PrismaClient,
  singleFilter,
  timeFilter,
  type SessionOptions,
  type ScoreDomain,
  LISTABLE_SCORE_TYPES,
} from "@langfuse/shared";
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
  getObservationFullIOForSessionFromEventsTable,
  getTracesGroupedByTags,
  getTracesIdentifierForSession,
  getScoresForTraces,
  getCostForTraces,
  getTracesGroupedByUsers,
  getPublicSessionsFilter,
  getSessionsWithMetrics,
  hasAnySession,
  getScoresForSessions,
  getNumericScoresGroupedByName,
  getBooleanScoresGroupedByName,
  getCategoricalScoresGroupedByName,
  tracesTableUiColumnDefinitions,
  getEventsGroupedByUserId,
  getEventsGroupedByTraceTags,
  hasAnySessionFromEventsTable,
  parseClickhouseUTCDateTimeFormat,
} from "@langfuse/shared/src/server";
import chunk from "lodash/chunk";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { toDomainArrayWithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

const SessionCountOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
});
const SessionFilterOptions = SessionCountOptions.extend({
  ...paginationZod,
});

const SessionTraceObservationsInput = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  traceId: z.string(),
  filter: z.array(singleFilter).nullable(),
});

/**
 * Bounded I/O contract for session-detail trace cards (LFE-10958). Cards are
 * previews: every observation field whose full length fits the inline limit
 * renders exactly as before; anything larger ships only a preview head plus
 * its true length, and the trace peek / download are the full-reading
 * surfaces. The inline limit matches the pretty view's client-side parse cap
 * (deepParseJson maxSize) so under-cap cards are behavior-identical.
 */
const SESSION_OBSERVATION_INLINE_IO_CHAR_LIMIT = 300_000;
const SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT = 4_000;
/** Cards show at most this many observations; the peek shows the rest. */
const SESSION_OBSERVATIONS_PER_TRACE_LIMIT = 50;
/**
 * Cumulative per-card I/O budget: once the summed returned I/O passes this,
 * later observations collapse to preview heads even when each field is under
 * the inline limit — many just-under-cap observations must not add up to an
 * unbounded response.
 */
const SESSION_TRACE_TOTAL_IO_CHAR_BUDGET = 2_000_000;

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

  // eslint-disable-next-line @typescript-eslint/no-deprecated
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
    dataTypes: LISTABLE_SCORE_TYPES,
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
      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "createdAt",
      });
      const sessions = await getSessionsTable({
        projectId: input.projectId,
        filter: finalFilter,
        orderBy: normalizedOrderBy,
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
      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "createdAt",
      });
      const sessions = await getSessionsTableFromEvents({
        projectId: input.projectId,
        filter: finalFilter,
        orderBy: normalizedOrderBy,
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
    .input(SessionCountOptions)
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
      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "createdAt",
      });
      const count = await getSessionsTableCount({
        projectId: input.projectId,
        filter: finalFilter,
        orderBy: normalizedOrderBy,
        page: 0,
        limit: 1,
      });

      return {
        totalCount: count,
      };
    }),
  countAllFromEvents: protectedProjectProcedure
    .input(SessionCountOptions)
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
      const normalizedOrderBy = normalizeOrderByForTable({
        orderBy: input.orderBy,
        expectedTimeColumn: "createdAt",
      });
      const count = await getSessionsTableCountFromEvents({
        projectId: input.projectId,
        filter: finalFilter,
        orderBy: normalizedOrderBy,
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
        dataTypes: LISTABLE_SCORE_TYPES,
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
        dataTypes: LISTABLE_SCORE_TYPES,
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

      const [
        userIds,
        tags,
        numericScoreNames,
        categoricalScoreNames,
        booleanScoreNames,
      ] = await Promise.all([
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
        getBooleanScoresGroupedByName(input.projectId, scoreTimestampFilter),
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
        score_booleans: booleanScoreNames.map((s) => s.name),
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

      const [
        userIds,
        tags,
        numericScoreNames,
        categoricalScoreNames,
        booleanScoreNames,
      ] = await Promise.all([
        getEventsGroupedByUserId(input.projectId, eventsFilter),
        getEventsGroupedByTraceTags(input.projectId, eventsFilter),
        getNumericScoresGroupedByName(input.projectId, scoreTimestampFilter),
        getCategoricalScoresGroupedByName(
          input.projectId,
          scoreTimestampFilter,
        ),
        getBooleanScoresGroupedByName(input.projectId, scoreTimestampFilter),
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
        score_booleans: booleanScoreNames.map((s) => s.name),
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
        dataTypes: LISTABLE_SCORE_TYPES,
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
      const [scores, sessionMetrics, postgresSession] = await Promise.all([
        getScoresForSessions({
          projectId: input.projectId,
          sessionIds: [input.sessionId],
        }),
        getSessionMetricsFromEvents({
          projectId: input.projectId,
          sessionIds: [input.sessionId],
        }).then((rows) => rows[0]),
        ctx.prisma.traceSession.findFirst({
          where: {
            id: input.sessionId,
            projectId: input.projectId,
          },
          select: {
            bookmarked: true,
            public: true,
          },
        }),
      ]);

      if (!sessionMetrics) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found in project",
        });
      }

      const validatedScores: ScoreDomain[] = filterAndValidateDbScoreList({
        scores,
        dataTypes: LISTABLE_SCORE_TYPES,
        onParseError: traceException,
      });

      return {
        id: input.sessionId,
        projectId: input.projectId,
        bookmarked: postgresSession?.bookmarked ?? false,
        public: postgresSession?.public ?? false,
        users:
          sessionMetrics?.user_ids?.filter(
            (userId) => userId !== null && userId !== "",
          ) ?? [],
        countTraces: sessionMetrics?.trace_count ?? 0,
        totalCost: sessionMetrics
          ? Number(sessionMetrics.session_total_cost)
          : 0,
        minTimestamp: parseClickhouseUTCDateTimeFormat(
          sessionMetrics.min_timestamp,
        ),
        maxTimestamp: parseClickhouseUTCDateTimeFormat(
          sessionMetrics.max_timestamp,
        ),
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
        dataTypes: LISTABLE_SCORE_TYPES,
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
      // One extra row is returned as the "more observations exist" sentinel
      // (the client shows the first LIMIT and surfaces a notice when it sees
      // the +1), and one more because the synthetic trace-level row (id
      // `t-<traceId>`) may sit in the fetched window without consuming a slot.
      let limit: number = SESSION_OBSERVATIONS_PER_TRACE_LIMIT + 2;
      let offset: number | undefined;

      if (positionFilter) {
        const fromEnd =
          positionFilter.key === "last" || positionFilter.key === "nthFromEnd";
        orderBy = { column: "startTime", order: fromEnd ? "DESC" : "ASC" };
        const rawIndex =
          positionFilter.key === "last" ||
          positionFilter.key === "first" ||
          positionFilter.key === "root"
            ? 1
            : (positionFilter.value ?? 1);
        const safeIndex = Math.max(1, rawIndex);
        offset = safeIndex - 1;
        limit = 1;
      }

      // No renderingProps: ioSizeCap owns the I/O select, and this path's
      // conversion always returns I/O as raw strings (the V1 enricher
      // hardcodes parseIoAsJson=false) — the client parses.
      const fetched = await getObservationsWithModelDataFromEventsTable({
        projectId: input.projectId,
        filter: filterState,
        searchQuery: undefined,
        searchType: [],
        orderBy,
        limit,
        offset,
        selectIOAndMetadata: true,
        ioSizeCap: {
          inlineChars: SESSION_OBSERVATION_INLINE_IO_CHAR_LIMIT,
          previewChars: SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT,
        },
        // Un-merged ReplacingMergeTree row versions of one span must not
        // count as separate observations: the 50-row page, the hasMore
        // detection, and the budget below all count rows.
        dedupeBySpanId: true,
      });

      // The synthetic trace-level row is metadata about the trace, not one of
      // its observations: it must neither consume one of the card's slots
      // (displacing a real observation) nor count toward the "more exist"
      // signal. The client decides whether to show or drop it (redundancy
      // dedupe).
      //
      // BACKWARD-COMPATIBLE RESPONSE SHAPE (LFE-10958 regression): this
      // procedure returns a BARE ARRAY of observations. The client consumes
      // the response as an array and calls `.find`/`.filter` on it directly,
      // so wrapping it in an `{ observations, ... }` envelope crashes in-flight
      // old clients during a rollout ("x.find is not a function"). "More
      // observations exist" is therefore signalled IN-BAND: we return up to
      // SESSION_OBSERVATIONS_PER_TRACE_LIMIT + 1 real observations, and the
      // client treats that extra (+1) row as the "has more" sentinel, showing
      // only the first LIMIT. (With a positionFilter the fetch limit is 1, so
      // at most one row is returned and the sentinel can never appear.)
      const syntheticTraceRowId = `t-${input.traceId}`;
      let realTaken = 0;
      const page: typeof fetched = [];
      for (const observation of fetched) {
        if (observation.id === syntheticTraceRowId) {
          page.push(observation);
          continue;
        }
        // Keep one past the display limit as the "more exist" sentinel.
        if (realTaken >= SESSION_OBSERVATIONS_PER_TRACE_LIMIT + 1) continue;
        page.push(observation);
        realTaken++;
      }

      // Preview head of a value regardless of parse state: I/O is a raw
      // string on this path, but if conversion ever starts returning parsed
      // objects the budget must keep holding — hence the stringify branch.
      // The cut is surrogate-safe: plain .slice can split an astral-plane
      // character (emoji/CJK) and leave a corrupted lone surrogate — the SQL
      // side avoids this via leftUTF8, so the JS fallback must too.
      const toPreviewHead = (value: unknown): unknown => {
        const text =
          typeof value === "string" ? value : (JSON.stringify(value) ?? "");
        if (text.length <= SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT)
          return value;
        const head = text.slice(0, SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT);
        const lastCode = head.charCodeAt(head.length - 1);
        return lastCode >= 0xd800 && lastCode <= 0xdbff
          ? head.slice(0, -1)
          : head;
      };

      // Cumulative budget: rows are order-stable (startTime ASC + span-dedup),
      // so the trim is deterministic. The check runs before adding the row's
      // own size, so the first observation always keeps whatever the per-field
      // cap allowed. Sizes come from the server-computed lengths + flags —
      // including the shipped metadata weight — NOT from the returned values,
      // so the accounting is independent of value shape.
      let cumulativeIOChars = 0;
      const observations = page.map((observation) => {
        const returnedIOChars =
          (observation.inputTruncated
            ? SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT
            : observation.inputLength) +
          (observation.outputTruncated
            ? SESSION_OBSERVATION_PREVIEW_IO_CHAR_LIMIT
            : observation.outputLength) +
          observation.metadataLength;
        const withinBudget =
          cumulativeIOChars <= SESSION_TRACE_TOTAL_IO_CHAR_BUDGET;
        cumulativeIOChars += returnedIOChars;
        if (withinBudget) return observation;

        const input = toPreviewHead(observation.input);
        const output = toPreviewHead(observation.output);
        return {
          ...observation,
          input,
          output,
          // Past the budget, metadata is dropped rather than shipped — the
          // flag routes readers to the trace view for the full values.
          metadata: {},
          metadataTruncated:
            observation.metadataTruncated || observation.metadataLength > 0,
          inputTruncated:
            observation.inputTruncated || input !== observation.input,
          outputTruncated:
            observation.outputTruncated || output !== observation.output,
        };
      });

      return observations;
    }),
  /**
   * Full raw I/O for one observation, for the session card's download
   * fallback (LFE-10958). Session-authorized (public sessions included); the
   * repository query scopes by sessionId so a session grant cannot read
   * observations outside that session. Returns raw strings — the client
   * saves them to a file and never renders them.
   */
  observationFullIOFromEvents: protectedGetSessionProcedure
    .input(
      z.object({
        projectId: z.string(),
        sessionId: z.string(),
        traceId: z.string(),
        observationId: z.string(),
        startTime: z.date(),
      }),
    )
    .query(async ({ input }) => {
      const observation = await getObservationFullIOForSessionFromEventsTable({
        projectId: input.projectId,
        sessionId: input.sessionId,
        traceId: input.traceId,
        observationId: input.observationId,
        startTime: input.startTime,
      });

      if (!observation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Observation not found in session",
        });
      }

      return observation;
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

      return ctx.prisma.traceSession.upsert({
        where: {
          id_projectId: {
            id: input.sessionId,
            projectId: input.projectId,
          },
        },
        create: {
          id: input.sessionId,
          projectId: input.projectId,
          bookmarked: input.bookmarked,
        },
        update: {
          bookmarked: input.bookmarked,
        },
      });
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
      return ctx.prisma.traceSession.upsert({
        where: {
          id_projectId: {
            id: input.sessionId,
            projectId: input.projectId,
          },
        },
        create: {
          id: input.sessionId,
          projectId: input.projectId,
          public: input.public,
        },
        update: {
          public: input.public,
        },
      });
    }),
});
