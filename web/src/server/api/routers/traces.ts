import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  BatchActionQuerySchema,
  BatchExportTableName,
  BatchActionType,
  filterAndValidateDbScoreList,
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared";
import { type ObservationView } from "@langfuse/shared";
import {
  traceException,
  getTracesTable,
  getTracesTableCount,
  getScoresForTraces,
  getScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
  getObservationsViewForTrace,
  getTraceById,
  logger,
  upsertTrace,
  convertTraceDomainToClickhouse,
  hasAnyTrace,
  QueueJobs,
  TraceDeleteQueue,
  getTracesTableMetrics,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});
type TraceFilterOptions = z.infer<typeof TraceFilterOptions>;

export type ObservationReturnType = Omit<
  ObservationView,
  "input" | "output" | "inputPrice" | "outputPrice" | "totalPrice" | "metadata"
> & {
  traceId: string;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
};

export type ObservationReturnTypeWithMetadata = ObservationReturnType &
  Pick<ObservationView, "metadata">;

export const traceRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return hasAnyTrace(input.projectId);
    }),
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const traces = await getTracesTable(
        ctx.session.projectId,
        input.filter ?? [],
        input.searchQuery ?? undefined,
        input.orderBy,
        input.limit,
        input.page,
      );
      return { traces };
    }),
  countAll: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const totalCount = await getTracesTableCount({
        projectId: ctx.session.projectId,
        filter: input.filter ?? [],
        searchQuery: input.searchQuery ?? undefined,
        limit: 1,
        page: 0,
      });
      return { totalCount };
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
      const res = await getTracesTableMetrics({
        projectId: ctx.session.projectId,
        filter: [
          ...(input.filter ?? []),
          {
            type: "stringOptions",
            operator: "any of",
            column: "ID",
            value: input.traceIds,
          },
        ],
      });

      const scores = await getScoresForTraces({
        projectId: ctx.session.projectId,
        traceIds: res.map((r) => r.id),
        limit: 1000,
        offset: 0,
      });

      const validatedScores = filterAndValidateDbScoreList(
        scores,
        traceException,
      );

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
        timestampFilter: timeFilter.optional(),
      }),
    )
    .query(async ({ input }) => {
      const { timestampFilter } = input;

      const [scoreNames, traceNames, tags] = await Promise.all([
        getScoresGroupedByName(
          input.projectId,
          timestampFilter ? [timestampFilter] : [],
        ),
        getTracesGroupedByName(
          input.projectId,
          tracesTableUiColumnDefinitions,
          timestampFilter ? [timestampFilter] : [],
        ),
        getTracesGroupedByTags({
          projectId: input.projectId,
          filter: timestampFilter ? [timestampFilter] : [],
        }),
      ]);

      return {
        name: traceNames.map((n) => ({ value: n.name })),
        scores_avg: scoreNames.map((s) => s.name),
        tags: tags,
      };
    }),
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
      }),
    )
    .query(async ({ ctx }) => {
      return {
        ...ctx.trace,
        input: ctx.trace.input ? JSON.stringify(ctx.trace.input) : undefined,
        output: ctx.trace.output ? JSON.stringify(ctx.trace.output) : undefined,
      };
    }),
  byIdWithObservationsAndScores: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input }) => {
      const [trace, observations, scores] = await Promise.all([
        getTraceById(
          input.traceId,
          input.projectId,
          input.timestamp ?? undefined,
        ),
        getObservationsViewForTrace(
          input.traceId,
          input.projectId,
          input.timestamp ?? undefined,
        ),
        getScoresForTraces({
          projectId: input.projectId,
          traceIds: [input.traceId],
          timestamp: input.timestamp ?? undefined,
        }),
      ]);

      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trace not found",
        });
      }

      const validatedScores = filterAndValidateDbScoreList(
        scores,
        traceException,
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

      return {
        ...trace,
        input: trace.input ? JSON.stringify(trace.input) : undefined,
        output: trace.output ? JSON.stringify(trace.output) : undefined,
        scores: validatedScores,
        latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
        observations: observations.map((o) => ({
          ...o,
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
          actionId: "trace-delete",
          actionType: BatchActionType.Delete,
          tableName: BatchExportTableName.Traces,
          session: ctx.session,
          query: input.query,
        });
      } else {
        const traceDeleteQueue = TraceDeleteQueue.getInstance();
        if (!traceDeleteQueue) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "TraceDeleteQueue not initialized",
          });
        }

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

        await traceDeleteQueue.add(QueueJobs.TraceDelete, {
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            projectId: input.projectId,
            traceIds: input.traceIds,
          },
          name: QueueJobs.TraceDelete,
        });
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

        const clickhouseTrace = await getTraceById(
          input.traceId,
          input.projectId,
        );
        if (clickhouseTrace) {
          trace = clickhouseTrace;
          clickhouseTrace.bookmarked = input.bookmarked;
          await upsertTrace(convertTraceDomainToClickhouse(clickhouseTrace));
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

        const clickhouseTrace = await getTraceById(
          input.traceId,
          input.projectId,
        );
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
        await upsertTrace(convertTraceDomainToClickhouse(clickhouseTrace));
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

        const clickhouseTrace = await getTraceById(
          input.traceId,
          input.projectId,
        );
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
});
