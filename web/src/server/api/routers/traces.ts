import { z } from "zod";

import {
  createTRPCRouter,
  protectedGetTraceProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  Prisma,
  type Trace,
  type ObservationView,
  type ObservationLevel,
} from "@langfuse/shared/src/db";
import { paginationZod } from "@langfuse/shared";
import { type TraceOptions, singleFilter } from "@langfuse/shared";
import { tracesTableCols } from "@langfuse/shared";
import {
  datetimeFilterToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { orderBy } from "@langfuse/shared";
import { orderByToPrismaSql } from "@langfuse/shared";
import { instrumentAsync } from "@/src/utils/instrumentation";
import type Decimal from "decimal.js";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  returnIO: z.boolean().default(true),
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
      const returnIO = input.returnIO;
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter ?? [],
        tracesTableCols,
        "traces",
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
          COALESCE(tm."promptTokens", 0)::int AS "promptTokens",
          COALESCE(tm."completionTokens", 0)::int AS "completionTokens",
          COALESCE(tm."totalTokens", 0)::int AS "totalTokens",
          tl.latency AS "latency",
          tl."observationCount" AS "observationCount",
          COALESCE(tm."calculatedTotalCost", 0)::numeric AS "calculatedTotalCost",
          COALESCE(tm."calculatedInputCost", 0)::numeric AS "calculatedInputCost",
          COALESCE(tm."calculatedOutputCost", 0)::numeric AS "calculatedOutputCost",
          tm."level" AS "level"
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
                level: ObservationLevel;
                observationCount: number;
                calculatedTotalCost: Decimal | null;
                calculatedInputCost: Decimal | null;
                calculatedOutputCost: Decimal | null;
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
          projectId: input.projectId,
          traceId: {
            in: traces.map((t) => t.id),
          },
        },
      });

      const totalTraceCount = totalTraces[0]?.count;
      return {
        traces: traces.map((trace) => {
          const filteredScores = scores.filter((s) => s.traceId === trace.id);

          const { input, output, ...rest } = trace;
          if (returnIO) {
            return { ...rest, input, output, scores: filteredScores };
          } else {
            return {
              ...rest,
              input: undefined,
              output: undefined,
              scores: filteredScores,
            };
          }
        }),
        totalCount: totalTraceCount ? Number(totalTraceCount) : undefined,
      };
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const scores = await ctx.prisma.score.groupBy({
        where: {
          projectId: input.projectId,
        },
        take: 1000,
        orderBy: {
          _count: {
            id: "desc",
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
        GROUP BY tags.tag
        LIMIT 1000
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
    .input(
      z.object({
        traceId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input.traceId,
        },
      });
      const observations = await ctx.prisma.observationView.findMany({
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
          projectId: trace.projectId,
        },
      });
      const scores = await ctx.prisma.score.findMany({
        where: {
          traceId: input.traceId,
          projectId: trace.projectId,
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
        scores,
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
      throwIfNoAccess({
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
      throwIfNoAccess({
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
      throwIfNoAccess({
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
      throwIfNoAccess({
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

function createTracesQuery(
  select: Prisma.Sql,
  projectId: string,
  observationTimeseriesFilter: Prisma.Sql,
  page: number,
  limit: number,
  searchCondition: Prisma.Sql,
  filterCondition: Prisma.Sql,
  orderByCondition: Prisma.Sql,
) {
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
        GROUP BY
            name
    ) tmp
  ) AS s_avg ON true
  WHERE 
    t."project_id" = ${projectId}
    ${searchCondition}
    ${filterCondition}
  ${orderByCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
}
