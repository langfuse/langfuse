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
  datetimeFilterToPrisma,
  datetimeFilterToPrismaSql,
  filterAndValidateDbScoreList,
  orderBy,
  orderByToPrismaSql,
  paginationZod,
  singleFilter,
  tableColumnsToSqlFilterAndPrefix,
  timeFilter,
  type TraceOptions,
  tracesTableCols,
} from "@langfuse/shared";
import {
  type ObservationLevel,
  type ObservationView,
  Prisma,
  type Trace,
} from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

import type Decimal from "decimal.js";
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
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
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
        traces: traces.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ input, output, metadata, ...trace }) => ({
            ...trace,
          }),
        ),
      };
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
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.traceIds.length === 0) return [];
      const tracesQuery = createTracesQuery({
        select: Prisma.sql`
          t.id,
          COALESCE(tm."promptTokens", 0)::bigint AS "promptTokens",
          COALESCE(tm."completionTokens", 0)::bigint AS "completionTokens",
          COALESCE(tm."totalTokens", 0)::bigint AS "totalTokens",
          tl.latency AS "latency",
          tl."observationCount" AS "observationCount",
          COALESCE(tm."calculatedTotalCost", 0)::numeric AS "calculatedTotalCost",
          COALESCE(tm."calculatedInputCost", 0)::numeric AS "calculatedInputCost",
          COALESCE(tm."calculatedOutputCost", 0)::numeric AS "calculatedOutputCost",
          tm."level" AS "level"
        `,
        projectId: input.projectId,
        filterCondition: Prisma.sql`AND t.id IN (${Prisma.join(input.traceIds)})`,
      });

      const [traceMetrics, scores] = await Promise.all([
        // traceMetrics
        ctx.prisma.$queryRaw<
          Array<{
            id: string;
            promptTokens: bigint;
            completionTokens: bigint;
            totalTokens: bigint;
            totalCount: number;
            latency: number | null;
            level: ObservationLevel;
            observationCount: number;
            calculatedTotalCost: Decimal | null;
            calculatedInputCost: Decimal | null;
            calculatedOutputCost: Decimal | null;
          }>
        >(tracesQuery),
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
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: timeFilter.optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
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
    }),
  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(), // used for security check
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input.traceId,
          projectId: input.projectId,
        },
      });
      return trace;
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

function parseTraceAllFilters(input: TraceFilterOptions) {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    input.filter ?? [],
    tracesTableCols,
    "traces",
  );
  const orderByCondition = orderByToPrismaSql(input.orderBy, tracesTableCols);

  // to improve query performance, add timeseries filter to observation queries as well
  const timeseriesFilter = input.filter?.find(
    (f) => f.column === "Timestamp" && f.type === "datetime",
  );

  const observationTimeseriesFilter =
    timeseriesFilter && timeseriesFilter.type === "datetime"
      ? datetimeFilterToPrismaSql(
          "start_time",
          timeseriesFilter.operator,
          timeseriesFilter.value,
        )
      : Prisma.empty;

  const searchCondition = input.searchQuery
    ? Prisma.sql`AND (
    t."id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."external_id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."user_id" ILIKE ${`%${input.searchQuery}%`} OR 
    t."name" ILIKE ${`%${input.searchQuery}%`}
  )`
    : Prisma.empty;

  return {
    filterCondition,
    orderByCondition,
    observationTimeseriesFilter,
    searchCondition,
  };
}

function createTracesQuery({
  select,
  projectId,
  observationTimeseriesFilter = Prisma.empty,
  page,
  limit,
  searchCondition = Prisma.empty,
  filterCondition = Prisma.empty,
  orderByCondition = Prisma.empty,
}: {
  select: Prisma.Sql;
  projectId: string;
  observationTimeseriesFilter?: Prisma.Sql;
  page?: number;
  limit?: number;
  searchCondition?: Prisma.Sql;
  filterCondition?: Prisma.Sql;
  orderByCondition?: Prisma.Sql;
}) {
  return Prisma.sql`
  SELECT
      ${select}
  FROM
    "traces" AS t
  LEFT JOIN LATERAL (
    SELECT
      SUM(prompt_tokens) AS "promptTokens",
      SUM(completion_tokens) AS "completionTokens",
      SUM(total_tokens) AS "totalTokens",
      SUM(calculated_total_cost) AS "calculatedTotalCost",
      SUM(calculated_input_cost) AS "calculatedInputCost",
      SUM(calculated_output_cost) AS "calculatedOutputCost",
      COALESCE(  
        MAX(CASE WHEN level = 'ERROR' THEN 'ERROR' END),  
        MAX(CASE WHEN level = 'WARNING' THEN 'WARNING' END),  
        MAX(CASE WHEN level = 'DEFAULT' THEN 'DEFAULT' END),  
        'DEBUG'  
      ) AS "level"
    FROM
      "observations_view"
    WHERE
      trace_id = t.id
      AND "type" = 'GENERATION'
      AND "project_id" = ${projectId}
      ${observationTimeseriesFilter}
  ) AS tm ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS "observationCount",
      EXTRACT(EPOCH FROM COALESCE(MAX("end_time"), MAX("start_time"))) - EXTRACT(EPOCH FROM MIN("start_time"))::double precision AS "latency"
    FROM
        "observations"
    WHERE
        trace_id = t.id
        AND "project_id" = ${projectId}
         ${observationTimeseriesFilter}
  ) AS tl ON true
  LEFT JOIN LATERAL (
    SELECT
        jsonb_object_agg(name::text, avg_value::double precision) AS "scores_avg"
    FROM (
        SELECT
            name,
            AVG(value) avg_value
        FROM
            scores
        WHERE
            trace_id = t.id
            AND scores."data_type" IN ('NUMERIC', 'BOOLEAN')
        GROUP BY
            name
    ) tmp
  ) AS s_avg ON true
  WHERE 
    t."project_id" = ${projectId}
    ${searchCondition}
    ${filterCondition}
  ${orderByCondition}
  ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
`;
}
