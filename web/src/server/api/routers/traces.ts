import { z } from "zod/v4";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { applyCommentFilters } from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchActionQuerySchema,
  BatchExportTableName,
  BatchActionType,
  ActionId,
  filterAndValidateDbScoreList,
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  type Observation,
  TracingSearchType,
  type ScoreDomain,
  AGGREGATABLE_SCORE_TYPES,
  ScoreDataTypeEnum,
} from "@langfuse/shared";
import {
  traceException,
  getTracesTable,
  getTracesTableCount,
  getScoresForTraces,
  getNumericScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
  getObservationsForTrace,
  getTraceById,
  logger,
  upsertTrace,
  convertTraceDomainToClickhouse,
  hasAnyTrace,
  traceDeletionProcessor,
  getTracesTableMetrics,
  getCategoricalScoresGroupedByName,
  convertDateToClickhouseDateTime,
  getAgentGraphData,
  tracesTableUiColumnDefinitions,
  getTracesGroupedByUsers,
  getTracesGroupedBySessionId,
  updateEvents,
  getScoresAndCorrectionsForTraces,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  type AgentGraphDataResponse,
  AgentGraphDataSchema,
} from "@/src/features/trace-graph-view/types";
import { env } from "@/src/env.mjs";
import {
  toDomainWithStringifiedMetadata,
  toDomainArrayWithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import partition from "lodash/partition";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  searchType: z.array(TracingSearchType),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});
type TraceFilterOptions = z.infer<typeof TraceFilterOptions>;

export type ObservationReturnTypeWithMetadata = Omit<
  Observation,
  "input" | "output" | "metadata"
> & {
  traceId: string;
  metadata: string | null;
  // optional, because in v4 an observation can have those properties
  userId?: string | null;
  sessionId?: string | null;
};

export type ObservationReturnType = Omit<
  ObservationReturnTypeWithMetadata,
  "metadata"
>;

export const traceRouter = createTRPCRouter({
  hasTracingConfigured: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      // Check if there are any traces in the database
      const hasTraces = await hasAnyTrace(input.projectId);

      if (hasTraces) {
        return true;
      }

      // If no traces, check if data retention is configured
      // This indicates the user has configured tracing even if data retention cleaned all traces
      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          retentionDays: true,
        },
      });

      return !!(project?.retentionDays && project.retentionDays > 0);
    }),
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "TRACE",
      });

      if (hasNoMatches) {
        return { traces: [] };
      }

      const traces = await getTracesTable({
        projectId: ctx.session.projectId,
        filter: filterState,
        searchQuery: input.searchQuery ?? undefined,
        searchType: input.searchType ?? ["id"],
        orderBy: input.orderBy,
        limit: input.limit,
        page: input.page,
      });
      return { traces };
    }),
  countAll: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterState, hasNoMatches } = await applyCommentFilters({
        filterState: input.filter ?? [],
        prisma: ctx.prisma,
        projectId: ctx.session.projectId,
        objectType: "TRACE",
      });

      if (hasNoMatches) {
        return { totalCount: 0 };
      }

      const count = await getTracesTableCount({
        projectId: ctx.session.projectId,
        filter: filterState,
        searchType: input.searchType,
        searchQuery: input.searchQuery ?? undefined,
        limit: 1,
        page: 0,
      });

      return {
        totalCount: count,
      };
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceIds: z.array(z.string()),
        filter: z.array(singleFilter).nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.traceIds.length === 0) return [];

      const { filterState, hasNoMatches, matchingIds } =
        await applyCommentFilters({
          filterState: input.filter ?? [],
          prisma: ctx.prisma,
          projectId: ctx.session.projectId,
          objectType: "TRACE",
        });

      if (hasNoMatches) {
        return [];
      }

      // If comment filters returned matching IDs, intersect with input.traceIds
      let filteredTraceIds = input.traceIds;
      if (matchingIds !== null) {
        filteredTraceIds = input.traceIds.filter((id) =>
          matchingIds.includes(id),
        );

        if (filteredTraceIds.length === 0) {
          return [];
        }
      }

      // Remove the comment filter's ID injection and use filteredTraceIds instead
      const filterWithoutCommentIds = filterState.filter(
        (f) =>
          !(
            f.type === "stringOptions" &&
            f.column === "id" &&
            f.operator === "any of"
          ),
      );

      const res = await getTracesTableMetrics({
        projectId: ctx.session.projectId,
        filter: [
          ...filterWithoutCommentIds,
          {
            type: "stringOptions",
            operator: "any of",
            column: "ID",
            value: filteredTraceIds,
          },
        ],
      });

      const traceScores = await getScoresForTraces({
        projectId: ctx.session.projectId,
        traceIds: res.map((r) => r.id),
        limit: 1000,
        offset: 0,
        excludeMetadata: true,
        includeHasMetadata: true,
      });

      const validatedScores = filterAndValidateDbScoreList({
        scores: traceScores,
        dataTypes: AGGREGATABLE_SCORE_TYPES,
        includeHasMetadata: true,
        onParseError: traceException,
      });

      return res.map((row) => ({
        ...row,
        scores: aggregateScores(
          validatedScores.filter((s) => s.traceId === row.id),
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
    .query(async ({ input }) => {
      const { timestampFilter } = input;

      const [
        numericScoreNames,
        categoricalScoreNames,
        traceNames,
        tags,
        userIds,
        sessionIds,
      ] = await Promise.all([
        getNumericScoresGroupedByName(input.projectId, timestampFilter ?? []),
        getCategoricalScoresGroupedByName(
          input.projectId,
          timestampFilter ?? [],
        ),
        getTracesGroupedByName(
          input.projectId,
          tracesTableUiColumnDefinitions,
          timestampFilter ?? [],
        ),
        getTracesGroupedByTags({
          projectId: input.projectId,
          filter: timestampFilter ?? [],
        }),
        getTracesGroupedByUsers(
          input.projectId,
          timestampFilter ?? [],
          undefined,
          100,
          0,
        ),
        getTracesGroupedBySessionId(
          input.projectId,
          timestampFilter ?? [],
          undefined,
          100,
          0,
        ),
      ]);

      return {
        name: traceNames.map((n) => ({ value: n.name, count: n.count })),
        scores_avg: numericScoreNames.map((s) => s.name),
        score_categories: categoricalScoreNames,
        tags: tags,
        users: userIds.map((u) => ({
          value: u.user,
          count: u.count,
        })),
        sessions: sessionIds.map((s) => ({
          value: s.session_id,
          count: s.count,
        })),
      };
    }),
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
        fromTimestamp: z.date().nullish(), // min timestamp of the trace. Used to query CH more efficiently
        verbosity: z.enum(["compact", "truncated", "full"]).default("full"),
      }),
    )
    .query(async ({ ctx }) => {
      return {
        ...ctx.trace,
        input: ctx.trace.input as string,
        output: ctx.trace.output as string,
        metadata: ctx.trace.metadata
          ? JSON.stringify(ctx.trace.metadata)
          : undefined,
      };
    }),
  byIdWithObservationsAndScores: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
        fromTimestamp: z.date().nullish(), // min timestamp of the trace. Used to query CH more efficiently
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trace not found",
        });
      }

      const [observations, traceScores] = await Promise.all([
        getObservationsForTrace({
          traceId: input.traceId,
          projectId: input.projectId,
          timestamp: input.timestamp ?? input.fromTimestamp ?? undefined,
          includeIO: false,
        }),
        getScoresAndCorrectionsForTraces({
          projectId: input.projectId,
          traceIds: [input.traceId],
          timestamp: input.timestamp ?? input.fromTimestamp ?? undefined,
        }),
      ]);

      const validatedScores = filterAndValidateDbScoreList({
        scores: traceScores,
        dataTypes: [...AGGREGATABLE_SCORE_TYPES, ScoreDataTypeEnum.CORRECTION],
        onParseError: traceException,
      });

      const [corrections, scores] = partition(
        validatedScores,
        (s) => s.dataType === ScoreDataTypeEnum.CORRECTION,
      );

      const obsStartTimes = observations
        .map((o) => o.startTime)
        .sort((a, b) => a.getTime() - b.getTime());
      const obsEndTimes = observations
        .map((o) => o.endTime)
        .filter((t) => t)
        .sort((a, b) => (a as Date).getTime() - (b as Date).getTime());
      const latencyMs =
        obsStartTimes.length > 0
          ? obsEndTimes.length > 0
            ? (obsEndTimes[obsEndTimes.length - 1] as Date).getTime() -
              obsStartTimes[0]!.getTime()
            : obsStartTimes.length > 1
              ? obsStartTimes[obsStartTimes.length - 1]!.getTime() -
                obsStartTimes[0]!.getTime()
              : undefined
          : undefined;

      const scoresDomain =
        toDomainArrayWithStringifiedMetadata<ScoreDomain>(scores);

      return {
        ...toDomainWithStringifiedMetadata(ctx.trace),
        input: ctx.trace.input ? JSON.stringify(ctx.trace.input) : null,
        output: ctx.trace.output ? JSON.stringify(ctx.trace.output) : null,
        scores: scoresDomain,
        corrections,
        latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
        observations: observations.map((o) => ({
          ...toDomainWithStringifiedMetadata(o),
          output: undefined,
          input: undefined, // this is not queried above.
        })) as ObservationReturnTypeWithMetadata[],
      };
    }),
  deleteMany: protectedProjectProcedure
    .input(
      z.object({
        traceIds: z.array(z.string()).min(1, "Minimum 1 traceId is required."),
        projectId: z.string(),
        query: BatchActionQuerySchema.optional(),
        isBatchAction: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:delete",
      });

      throwIfNoEntitlement({
        entitlement: "trace-deletion",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });

      if (input.isBatchAction && input.query) {
        await createBatchActionJob({
          projectId: input.projectId,
          actionId: ActionId.TraceDelete,
          actionType: BatchActionType.Delete,
          tableName: BatchExportTableName.Traces,
          session: ctx.session,
          query: input.query,
        });
      } else {
        await Promise.all(
          input.traceIds.map((traceId) =>
            auditLog({
              resourceType: "trace",
              resourceId: traceId,
              action: "delete",
              session: ctx.session,
            }),
          ),
        );

        await traceDeletionProcessor(input.projectId, input.traceIds);
      }
    }),
  bookmark: protectedProjectProcedure
    .input(
      z.object({
        traceId: z.string(),
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
      try {
        await auditLog({
          session: ctx.session,
          resourceType: "trace",
          resourceId: input.traceId,
          action: "bookmark",
          after: input.bookmarked,
        });

        let trace;

        const clickhouseTrace = await getTraceById({
          traceId: input.traceId,
          projectId: input.projectId,
          clickhouseFeatureTag: "tracing-trpc",
        });
        if (clickhouseTrace) {
          trace = clickhouseTrace;
          clickhouseTrace.bookmarked = input.bookmarked;
          const promises = [
            upsertTrace(convertTraceDomainToClickhouse(clickhouseTrace)),
          ];
          if (env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS === "true") {
            promises.push(
              updateEvents(
                input.projectId,
                { traceIds: [clickhouseTrace.id], rootOnly: true },
                { bookmarked: input.bookmarked },
              ),
            );
          }
          await Promise.all(promises);
        } else {
          logger.error(
            `Trace not found in Clickhouse: ${input.traceId}. Skipping bookmark.`,
          );
        }

        return trace;
      } catch (error) {
        logger.error("Failed to call traces.bookmark", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  publish: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        public: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:publish",
      });
      try {
        await auditLog({
          session: ctx.session,
          resourceType: "trace",
          resourceId: input.traceId,
          action: "publish",
          after: input.public,
        });

        const clickhouseTrace = await getTraceById({
          traceId: input.traceId,
          projectId: input.projectId,
          clickhouseFeatureTag: "tracing-trpc",
        });
        if (!clickhouseTrace) {
          logger.error(
            `Trace not found in Clickhouse: ${input.traceId}. Skipping publishing.`,
          );
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trace not found",
          });
        }
        clickhouseTrace.public = input.public;
        const promises = [
          upsertTrace(convertTraceDomainToClickhouse(clickhouseTrace)),
        ];
        if (env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS === "true") {
          promises.push(
            updateEvents(
              input.projectId,
              { traceIds: [clickhouseTrace.id] },
              { public: input.public },
            ),
          );
        }
        await Promise.all(promises);
        return clickhouseTrace;
      } catch (error) {
        logger.error("Failed to call traces.publish", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  updateTags: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        tags: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:tag",
      });
      try {
        await auditLog({
          session: ctx.session,
          resourceType: "trace",
          resourceId: input.traceId,
          action: "updateTags",
          after: input.tags,
        });

        const clickhouseTrace = await getTraceById({
          traceId: input.traceId,
          projectId: input.projectId,
          clickhouseFeatureTag: "tracing-trpc",
        });
        if (!clickhouseTrace) {
          logger.error(
            `Trace not found in Clickhouse: ${input.traceId}. Skipping tag update.`,
          );
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trace not found",
          });
        }
        clickhouseTrace.tags = input.tags;
        await upsertTrace(convertTraceDomainToClickhouse(clickhouseTrace));
      } catch (error) {
        logger.error("Failed to call traces.updateTags", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),

  getAgentGraphData: protectedGetTraceProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        minStartTime: z.string(),
        maxStartTime: z.string(),
        // Optional fields for enforceTraceAccess middleware (supports public traces)
        timestamp: z.date().nullish(),
        fromTimestamp: z.date().nullish(),
      }),
    )
    .query(async ({ input }): Promise<Required<AgentGraphDataResponse>[]> => {
      const { traceId, projectId, minStartTime, maxStartTime } = input;

      const chMinStartTime = convertDateToClickhouseDateTime(
        new Date(minStartTime),
      );
      const chMaxStartTime = convertDateToClickhouseDateTime(
        new Date(maxStartTime),
      );

      const records = await getAgentGraphData({
        projectId,
        traceId,
        chMinStartTime,
        chMaxStartTime,
      });

      const result = records
        .map((r) => {
          const parsed = AgentGraphDataSchema.safeParse(r);
          if (!parsed.success) {
            return null;
          }

          const data = parsed.data;
          const hasLangGraphData = data.step != null && data.node != null;
          const hasAgentData = data.type !== "EVENT"; // Include all types except EVENT

          if (hasLangGraphData) {
            return {
              id: data.id,
              node: data.node,
              step: data.step,
              parentObservationId: data.parent_observation_id || null,
              name: data.name,
              startTime: data.start_time,
              endTime: data.end_time || undefined,
              observationType: data.type,
            };
          } else if (hasAgentData) {
            return {
              id: data.id,
              node: data.name,
              step: 0,
              parentObservationId: data.parent_observation_id || null,
              name: data.name,
              startTime: data.start_time,
              endTime: data.end_time || undefined,
              observationType: data.type,
            };
          }

          return null;
        })
        .filter((r) => Boolean(r)) as Required<AgentGraphDataResponse>[];

      return result;
    }),
});
