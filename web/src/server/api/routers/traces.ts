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
  filterAndValidateDbScoreList,
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  type TraceOptions,
} from "@langfuse/shared";

import {
  type ObservationLevel,
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
  getScoresForTraces,
  getTraceById,
  type TracesTableReturnType,
  getScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";
import { type ScoreAggregate } from "@/src/features/scores/lib/types";

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
  "input" | "output"
> & {
  traceId: string;
};

export type TracesAllReturnType = {
  id: string;
  timestamp: Date;
  name: string | undefined;
  projectId: string;
  userId: string | undefined;
  release: string | undefined;
  version: string | undefined;
  public: boolean;
  bookmarked: boolean;
  sessionId: string | undefined;
  tags: string[];
};

export const convertToReturnType = (
  row: TracesTableReturnType,
): TracesAllReturnType => {
  return {
    id: row.id,
    name: row.name,
    timestamp: new Date(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    release: row.release,
    version: row.version,
    projectId: row.project_id,
    userId: row.user_id,
    sessionId: row.session_id,
    public: row.public,
  };
};

export type TracesMetricsReturnType = {
  id: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevel;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  scores: ScoreAggregate;
};

export const convertMetricsReturnType = (
  row: TracesTableReturnType & { scores: ScoreAggregate },
): TracesMetricsReturnType => {
  return {
    id: row.id,
    promptTokens: BigInt(row.usage_details?.input ?? 0),
    completionTokens: BigInt(row.usage_details?.output ?? 0),
    totalTokens: BigInt(row.usage_details?.total ?? 0),
    latency: row.latency,
    level: row.level,
    observationCount: BigInt(row.observation_count ?? 0),
    calculatedTotalCost: row.cost_details?.total
      ? new Decimal(row.cost_details.total)
      : null,
    calculatedInputCost: row.cost_details?.input
      ? new Decimal(row.cost_details.input)
      : null,
    calculatedOutputCost: row.cost_details?.output
      ? new Decimal(row.cost_details.output)
      : null,
    scores: row.scores,
  };
};

export const traceRouter = createTRPCRouter({
  hasAny: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const hasAny = await ctx.prisma.trace.findFirst({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });
      return hasAny !== null;
    }),
  all: protectedProjectProcedure
    .input(
      TraceFilterOptions.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!input.queryClickhouse) {
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
          traces: traces.map<TracesAllReturnType>(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ input, output, metadata, ...trace }) => ({
              ...trace,
              name: trace.name ?? undefined,
              release: trace.release ?? undefined,
              version: trace.version ?? undefined,
              externalId: trace.externalId ?? undefined,
              userId: trace.userId ?? undefined,
              sessionId: trace.sessionId ?? undefined,
            }),
          ),
        };
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        const res = await getTracesTable(
          ctx.session.projectId,
          input.filter ?? [],
          input.limit,
          input.page,
        );

        return {
          traces: res.map(convertToReturnType),
        };
      }
    }),
  countAll: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const { filterCondition, observationTimeseriesFilter, searchCondition } =
        parseTraceAllFilters(input);

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
    }),
  metrics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceIds: z.array(z.string()),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.traceIds.length === 0) return [];

      if (!input.queryClickhouse) {
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
          ctx.prisma.$queryRaw<Array<TracesMetricsReturnType>>(tracesQuery),
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
      } else {
        ctx.session.user;
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        const res = await getTracesTable(
          ctx.session.projectId,
          [],
          // input.filter
        );

        const scores = await getScoresForTraces(
          ctx.session.projectId,
          res.map((r) => r.id),
          1000,
          0,
        );

        const validatedScores = filterAndValidateDbScoreList(
          scores,
          traceException,
        );

        return res.map((r) =>
          convertMetricsReturnType({
            ...r,
            scores: aggregateScores(
              validatedScores.filter((s) => s.traceId === r.id),
            ),
          }),
        );
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
      if (!input.queryClickhouse) {
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
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        const { timestampFilter } = input;

        const [scoreNames, traceNames, tags] = await Promise.all([
          getScoresGroupedByName(
            input.projectId,
            timestampFilter ? [timestampFilter] : [],
          ),
          getTracesGroupedByName(
            input.projectId,
            timestampFilter ? [timestampFilter] : [],
          ),
          getTracesGroupedByTags(
            input.projectId,
            timestampFilter ? [timestampFilter] : [],
          ),
        ]);

        const res: TraceOptions = {
          name: traceNames,
          scores_avg: scoreNames.map((s) => s.name),
          tags: tags,
        };
        return res;
      }
    }),
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!input.queryClickhouse) {
        return await ctx.prisma.trace.findFirstOrThrow({
          where: {
            id: input.traceId,
            projectId: input.projectId,
          },
        });
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        return await getTraceById(input.traceId, input.projectId);
      }
    }),
  byIdWithObservationsAndScores: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input, ctx }) => {
      const [trace, observations, scores] = await Promise.all([
        ctx.prisma.trace.findFirstOrThrow({
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

      for (const traceId of input.traceIds) {
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "delete",
          session: ctx.session,
        });
      }

      return ctx.prisma.$transaction([
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
      ]);
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
        const trace = await ctx.prisma.trace.update({
          where: {
            id: input.traceId,
            projectId: input.projectId,
          },
          data: {
            bookmarked: input.bookmarked,
          },
        });
        return trace;
      } catch (error) {
        console.error(error);
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025" // Record to update not found
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trace not found in project",
          });
        } else {
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
        const trace = await ctx.prisma.trace.update({
          where: {
            id: input.traceId,
            projectId: input.projectId,
          },
          data: {
            public: input.public,
          },
        });
        return trace;
      } catch (error) {
        console.error(error);
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025" // Record to update not found
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trace not found in project",
          });
        } else {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
          });
        }
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
        await ctx.prisma.trace.update({
          where: {
            id: input.traceId,
            projectId: input.projectId,
          },
          data: {
            tags: {
              set: input.tags,
            },
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "trace",
          resourceId: input.traceId,
          action: "updateTags",
          after: input.tags,
        });
      } catch (error) {
        console.error(error);
      }
    }),
});
