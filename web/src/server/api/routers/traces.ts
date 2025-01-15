import { z } from "zod";
import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  filterAndValidateDbScoreList,
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  type TraceOptions,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared";
import {
  type ObservationView,
  Prisma,
  type Trace,
} from "@langfuse/shared/src/db";
import {
  datetimeFilterToPrisma,
  datetimeFilterToPrismaSql,
  traceException,
  createTracesQuery,
  parseTraceAllFilters,
  getTracesTable,
  getTracesTableCount,
  getScoresForTraces,
  getScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
  getObservationsViewForTrace,
  deleteTraces,
  deleteScoresByTraceIds,
  deleteObservationsByTraceIds,
  getTraceById,
  logger,
  upsertTrace,
  convertTraceDomainToClickhouse,
  hasAnyTrace,
  QueueJobs,
  TraceDeleteQueue,
  getTracesTableMetrics,
  type TracesAllUiReturnType,
  type TracesMetricsUiReturnType,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { randomUUID } from "crypto";

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

export const traceRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "traces.hasAny",
        user: ctx.session.user,
        pgExecution: async () => {
          const hasAny = await ctx.prisma.trace.findFirst({
            where: {
              projectId: input.projectId,
            },
            select: {
              id: true,
            },
          });
          return hasAny !== null;
        },
        clickhouseExecution: async () => {
          return await hasAnyTrace(input.projectId);
        },
      });
    }),
  all: protectedProjectProcedure
    .input(
      TraceFilterOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "traces.all",
        user: ctx.session.user,
        pgExecution: async () => {
          const {
            filterCondition,
            orderByCondition,
            observationTimeseriesFilter,
            searchCondition,
          } = parseTraceAllFilters(input);

          const tracesQuery = createTracesQuery({
            select: Prisma.sql`
            t.*,
            t."user_id" AS "userId",
            t.session_id AS "sessionId"
            `,
            projectId: input.projectId,
            observationTimeseriesFilter,
            page: input.page,
            limit: input.limit,
            searchCondition,
            filterCondition,
            orderByCondition,
          });

          const traces = await ctx.prisma.$queryRaw<Array<Trace>>(tracesQuery);

          return {
            traces: traces.map<TracesAllUiReturnType>(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ({ input, output, metadata, ...trace }) => ({
                ...trace,
                name: trace.name,
                release: trace.release,
                version: trace.version,
                externalId: trace.externalId,
                userId: trace.userId,
                sessionId: trace.sessionId,
              }),
            ),
          };
        },
        clickhouseExecution: async () => {
          const res = await getTracesTable(
            ctx.session.projectId,
            input.filter ?? [],
            input.searchQuery ?? undefined,
            input.orderBy,
            input.limit,
            input.page,
          );

          return {
            traces: res,
          };
        },
      });
    }),
  countAll: protectedProjectProcedure
    .input(
      TraceFilterOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "traces.countAll",
        user: ctx.session.user,
        pgExecution: async () => {
          const {
            filterCondition,
            observationTimeseriesFilter,
            searchCondition,
          } = parseTraceAllFilters(input);

          const countQuery = createTracesQuery({
            select: Prisma.sql`count(*)`,
            projectId: input.projectId,
            observationTimeseriesFilter,
            page: 0,
            limit: 1,
            searchCondition,
            filterCondition,
          });

          const totalTraces =
            await ctx.prisma.$queryRaw<Array<{ count: bigint }>>(countQuery);

          const totalTraceCount = totalTraces[0]?.count;
          return {
            totalCount: totalTraceCount ? Number(totalTraceCount) : undefined,
          };
        },
        clickhouseExecution: async () => {
          const countQuery = await getTracesTableCount({
            projectId: ctx.session.projectId,
            filter: input.filter ?? [],
            searchQuery: input.searchQuery ?? undefined,
            limit: 1,
            page: 0,
          });

          return {
            totalCount: countQuery,
          };
        },
      });
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceIds: z.array(z.string()),
        filter: z.array(singleFilter).nullable(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.traceIds.length === 0) return [];
      return await measureAndReturnApi({
        input,
        operation: "traces.metrics",
        user: ctx.session.user,
        pgExecution: async () => {
          const tracesQuery = createTracesQuery({
            select: Prisma.sql`
          t.id,
          COALESCE(generation_metrics."promptTokens", 0)::bigint AS "promptTokens",
          COALESCE(generation_metrics."completionTokens", 0)::bigint AS "completionTokens",
          COALESCE(generation_metrics."totalTokens", 0)::bigint AS "totalTokens",
          observation_metrics.latency AS "latency",
          observation_metrics."observationCount" AS "observationCount",
          COALESCE(generation_metrics."calculatedTotalCost", 0)::numeric AS "calculatedTotalCost",
          COALESCE(generation_metrics."calculatedInputCost", 0)::numeric AS "calculatedInputCost",
          COALESCE(generation_metrics."calculatedOutputCost", 0)::numeric AS "calculatedOutputCost",
          observation_metrics."level" AS "level"
        `,
            projectId: input.projectId,
            filterCondition: Prisma.sql`AND t.id IN (${Prisma.join(input.traceIds)})`,
          });

          const [traceMetrics, scores] = await Promise.all([
            // traceMetrics
            ctx.prisma.$queryRaw<Array<TracesMetricsUiReturnType>>(tracesQuery),
            // scores
            ctx.prisma.score.findMany({
              where: {
                projectId: input.projectId,
                traceId: {
                  in: input.traceIds,
                },
              },
            }),
          ]);

          const validatedScores = filterAndValidateDbScoreList(
            scores,
            traceException,
          );

          return traceMetrics.map((row) => ({
            ...row,
            scores: aggregateScores(
              validatedScores.filter((s) => s.traceId === row.id),
            ),
          }));
        },
        clickhouseExecution: async () => {
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
        },
      });
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
      return await measureAndReturnApi({
        input,
        operation: "traces.filterOptions",
        user: ctx.session.user,
        pgExecution: async () => {
          const { timestampFilter } = input;
          const prismaTimestampFilter = timestampFilter
            ? datetimeFilterToPrisma(timestampFilter)
            : {};

          const rawTimestampFilter =
            timestampFilter && timestampFilter.type === "datetime"
              ? datetimeFilterToPrismaSql(
                  "timestamp",
                  timestampFilter.operator,
                  timestampFilter.value,
                )
              : Prisma.empty;

          const [scores, names, tags] = await Promise.all([
            ctx.prisma.score.groupBy({
              where: {
                projectId: input.projectId,
                timestamp: prismaTimestampFilter,
                dataType: { in: ["NUMERIC", "BOOLEAN"] },
              },
              take: 1000,
              orderBy: { name: "asc" },
              by: ["name"],
            }),
            ctx.prisma.trace.groupBy({
              where: {
                projectId: input.projectId,
                timestamp: prismaTimestampFilter,
              },
              by: ["name"],
              // limiting to 1k trace names to avoid performance issues.
              // some users have unique names for large amounts of traces
              // sending all trace names to the FE exceeds the cloud function return size limit
              take: 1000,
              orderBy: { name: "asc" },
            }),
            ctx.prisma.$queryRaw<{ value: string }[]>`
          SELECT tags.tag as value
          FROM traces, UNNEST(traces.tags) AS tags(tag)
          WHERE traces.project_id = ${input.projectId} ${rawTimestampFilter}
          GROUP BY tags.tag
          ORDER BY tags.tag ASC
          LIMIT 1000
        `,
          ]);
          const res: TraceOptions = {
            scores_avg: scores.map((score) => score.name),
            name: names
              .filter((n) => n.name !== null)
              .map((name) => ({
                value: name.name ?? "undefined",
              })),
            tags: tags,
          };
          return res;
        },
        clickhouseExecution: async () => {
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

          const res: TraceOptions = {
            name: traceNames.map((n) => ({ value: n.name })),
            scores_avg: scoreNames.map((s) => s.name),
            tags: tags,
          };
          return res;
        },
      });
    }),
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "traces.byId",
        user: ctx.session.user ?? undefined,
        pgExecution: async () => {
          return ctx.prisma.trace.findFirstOrThrow({
            where: {
              id: input.traceId,
              projectId: input.projectId,
            },
          });
        },
        clickhouseExecution: async () => {
          const trace = getTraceById(
            input.traceId,
            input.projectId,
            input.timestamp ?? undefined,
          );
          if (!trace) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Trace not found",
            });
          }
          return trace;
        },
      });
    }),
  byIdWithObservationsAndScores: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        timestamp: z.date().nullish(), // timestamp of the trace. Used to query CH more efficiently
        projectId: z.string(), // used for security check
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "traces.byIdWithObservationsAndScores",
        user: ctx.session.user ?? undefined,
        pgExecution: async () => {
          const [trace, observations, scores] = await Promise.all([
            ctx.prisma.trace.findFirst({
              where: {
                id: input.traceId,
                projectId: input.projectId,
              },
            }),
            ctx.prisma.observationView.findMany({
              select: {
                id: true,
                traceId: true,
                projectId: true,
                type: true,
                startTime: true,
                endTime: true,
                name: true,
                parentObservationId: true,
                level: true,
                statusMessage: true,
                version: true,
                createdAt: true,
                model: true,
                modelParameters: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                unit: true,
                completionStartTime: true,
                timeToFirstToken: true,
                promptId: true,
                modelId: true,
                inputPrice: true,
                outputPrice: true,
                totalPrice: true,
                calculatedInputCost: true,
                calculatedOutputCost: true,
                calculatedTotalCost: true,
                promptName: true,
                promptVersion: true,
                latency: true,
                updatedAt: true,
              },
              where: {
                traceId: {
                  equals: input.traceId,
                  not: null,
                },
                projectId: input.projectId,
              },
            }),
            ctx.prisma.score.findMany({
              where: {
                traceId: input.traceId,
                projectId: input.projectId,
              },
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
            scores: validatedScores,
            latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
            observations: observations.map((o) => ({
              ...o,
              usageDetails: {}, // no usageDetails in legacy postgres
              costDetails: {}, // no costDetails in legacy postgres
            })) as ObservationReturnType[],
          };
        },
        clickhouseExecution: async () => {
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
            scores: validatedScores,
            latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
            observations: observations as ObservationReturnType[],
          };
        },
      });
    }),
  deleteMany: protectedProjectProcedure
    .input(
      z.object({
        traceIds: z.array(z.string()).min(1, "Minimum 1 trace_Id is required."),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:delete",
      });

      const traceDeleteQueue = TraceDeleteQueue.getInstance();

      for (const traceId of input.traceIds) {
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "delete",
          session: ctx.session,
        });
      }

      if (!traceDeleteQueue) {
        logger.warn(
          `TraceDeleteQueue not initialized. Try synchronous deletion for ${input.traceIds.length} traces.`,
        );
        await ctx.prisma.$transaction([
          ctx.prisma.trace.deleteMany({
            where: {
              id: {
                in: input.traceIds,
              },
              projectId: input.projectId,
            },
          }),
          ctx.prisma.observation.deleteMany({
            where: {
              traceId: {
                in: input.traceIds,
              },
              projectId: input.projectId,
            },
          }),
          ctx.prisma.score.deleteMany({
            where: {
              traceId: {
                in: input.traceIds,
              },
              projectId: input.projectId,
            },
          }),
          // given traces and observations live in ClickHouse we cannot enforce a fk relationship and onDelete: setNull
          ctx.prisma.jobExecution.updateMany({
            where: {
              jobInputTraceId: { in: input.traceIds },
              projectId: input.projectId,
            },
            data: {
              jobInputTraceId: {
                set: null,
              },
              jobInputObservationId: {
                set: null,
              },
            },
          }),
        ]);

        if (env.CLICKHOUSE_URL) {
          await Promise.all([
            deleteTraces(input.projectId, input.traceIds),
            deleteObservationsByTraceIds(input.projectId, input.traceIds),
            deleteScoresByTraceIds(input.projectId, input.traceIds),
          ]);
        }
        return;
      }

      await traceDeleteQueue.add(QueueJobs.TraceDelete, {
        timestamp: new Date(),
        id: randomUUID(),
        payload: {
          projectId: input.projectId,
          traceIds: input.traceIds,
        },
        name: QueueJobs.TraceDelete,
      });
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
