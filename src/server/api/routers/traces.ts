import { z } from "zod";

import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Trace, type ObservationView } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import {
  type TraceOptions,
  tracesTableCols,
} from "@/src/server/api/definitions/tracesTable";
import {
  datetimeFilterToPrismaSql,
  filterToPrismaSql,
} from "@/src/features/filters/server/filterToPrisma";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { orderBy } from "@/src/server/api/interfaces/orderBy";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { type Sql } from "@prisma/client/runtime/library";
import { instrumentAsync } from "@/src/utils/instrumentation";
import type Decimal from "decimal.js";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  ...paginationZod,
});

export type ObservationReturnType = Omit<
  ObservationView,
  "input" | "output"
> & {
  traceId: string;
};

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = filterToPrismaSql(
        input.filter ?? [],
        tracesTableCols,
      );
      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        tracesTableCols,
      );

      // to improve query performance, add timeseries filter to observation queries as well
      const timeseriesFilter = input.filter?.find(
        (f) => f.column === "timestamp" && f.type === "datetime",
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

      const tracesQuery = createTracesQuery(
        Prisma.sql`t.*,
          t."user_id" AS "userId",
          t."metadata" AS "metadata",
          t.session_id AS "sessionId",
          t."bookmarked" AS "bookmarked",
          COALESCE(u."promptTokens", 0)::int AS "promptTokens",
          COALESCE(u."completionTokens", 0)::int AS "completionTokens",
          COALESCE(u."totalTokens", 0)::int AS "totalTokens",
          tl.latency AS "latency",
          COALESCE(u."calculatedTotalCost", 0)::numeric AS "calculatedTotalCost"
          `,

        input.projectId,
        observationTimeseriesFilter,
        input.page,
        input.limit,
        searchCondition,
        filterCondition,
        orderByCondition,
      );

      const traces = await instrumentAsync(
        { name: "get-all-traces" },
        async () =>
          await ctx.prisma.$queryRaw<
            Array<
              Trace & {
                promptTokens: number;
                completionTokens: number;
                totalTokens: number;
                totalCount: number;
                latency: number | null;
                calculatedTotalCost: Decimal | null;
              }
            >
          >(tracesQuery),
      );

      const countQyery = createTracesQuery(
        Prisma.sql`count(*)`,
        input.projectId,
        observationTimeseriesFilter,
        0,
        1,
        searchCondition,
        filterCondition,
        Prisma.empty,
      );

      const totalTraces =
        await ctx.prisma.$queryRaw<Array<{ count: bigint }>>(countQyery);

      // get scores for each trace individually to increase
      // performance of the query above
      const scores = await ctx.prisma.score.findMany({
        where: {
          trace: {
            projectId: input.projectId,
          },
          traceId: {
            in: traces.map((t) => t.id),
          },
        },
      });
      const totalTraceCount = totalTraces[0]?.count;
      return {
        traces: traces.map((trace) => {
          const filteredScores = scores.filter((s) => s.traceId === trace.id);
          return { ...trace, scores: filteredScores };
        }),
        totalCount: totalTraceCount ? Number(totalTraceCount) : undefined,
      };
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const scores = await ctx.prisma.score.groupBy({
        where: {
          trace: {
            projectId: input.projectId,
          },
        },
        by: ["name"],
      });
      const names = await ctx.prisma.trace.groupBy({
        where: {
          projectId: input.projectId,
        },
        by: ["name"],
        // limiting to 1k trace names to avoid performance issues.
        // some users have unique names for large amounts of traces
        // sending all trace names to the FE exceeds the cloud function return size limit
        take: 1000,
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        _count: {
          id: true,
        },
      });
      const tags: { count: number; value: string }[] = await ctx.prisma
        .$queryRaw`
        SELECT COUNT(*)::integer AS "count", tags.tag as value
        FROM traces, UNNEST(traces.tags) AS tags(tag)
        WHERE traces.project_id = ${input.projectId}
        GROUP BY tags.tag;
      `;
      const res: TraceOptions = {
        scores_avg: scores.map((score) => score.name),
        name: names
          .filter((n) => n.name !== null)
          .map((name) => ({
            value: name.name ?? "undefined",
            count: name._count.id,
          })),
        tags: tags,
      };
      return res;
    }),
  byId: protectedGetTraceProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input.traceId,
        },
        include: {
          scores: true,
        },
      });
      const observations = await ctx.prisma.observationView.findMany({
        where: {
          traceId: {
            equals: input.traceId,
            not: null,
          },
        },
      });

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
        latency: latencyMs !== undefined ? latencyMs / 1000 : undefined,
        observations: observations.map(
          ({ input: _input, output: _output, ...rest }) => {
            return { ...rest };
          },
        ) as ObservationReturnType[],
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:delete",
      });

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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:bookmark",
      });
      try {
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:publish",
      });
      try {
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "objects:tag",
      });
      try {
        const trace = await ctx.prisma.trace.update({
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
        return trace;
      } catch (error) {
        console.error(error);
      }
    }),
});

function createTracesQuery(
  select: Sql,
  projectId: string,
  observationTimeseriesFilter: Sql,
  page: number,
  limit: number,
  searchCondition: Sql,
  filterCondition: Sql,
  orderByCondition: Sql,
) {
  return Prisma.sql`
  WITH usage AS (
    SELECT
      trace_id,
      sum(prompt_tokens) AS "promptTokens",
      sum(completion_tokens) AS "completionTokens",
      sum(total_tokens) AS "totalTokens",
      sum(calculated_total_cost) AS "calculatedTotalCost"
    FROM
      "observations_view"
    WHERE
      "trace_id" IS NOT NULL
      AND "type" = 'GENERATION'
      AND "project_id" = ${projectId}
      ${observationTimeseriesFilter}
    GROUP BY
      trace_id
  ),
  trace_latency AS (
    SELECT
      trace_id,
      EXTRACT(EPOCH FROM COALESCE(MAX("end_time"), MAX("start_time"))) - EXTRACT(EPOCH FROM MIN("start_time"))::double precision AS "latency"
    FROM
      "observations"
    WHERE
      "trace_id" IS NOT NULL
      AND "project_id" = ${projectId}
      ${observationTimeseriesFilter}
    GROUP BY
      trace_id
  ),
  -- used for filtering
  scores_avg AS (
    SELECT
      trace_id,
      jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
    FROM (
      SELECT
        trace_id,
        name,
        avg(value) avg_value
      FROM
        scores
      GROUP BY
        1,
        2
      ORDER BY
        1) tmp
    GROUP BY
      1
  )
  SELECT
      ${select}
  FROM
    "traces" AS t
    LEFT JOIN usage AS u ON u.trace_id = t.id
    -- used for filtering
    LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id
    LEFT JOIN trace_latency AS tl ON tl.trace_id = t.id
  WHERE 
    t."project_id" = ${projectId}
    ${searchCondition}
    ${filterCondition}
  ${orderByCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
}
