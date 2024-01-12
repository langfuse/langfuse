import {
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { executeQuery } from "@/src/server/api/services/query-builder";
import { sqlInterface } from "@/src/server/api/services/sqlInterface";

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(sqlInterface.extend({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await executeQuery(ctx.prisma, input.projectId, input);
    }),
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await ctx.prisma.chart.findMany({
        where: {
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        chartType: z.union([z.literal("timeseries"), z.literal("table")]),
        query: sqlInterface.extend({ projectId: z.string() }),
        chartConfig: z.object({
          position: z.number().int(),
        }),
      }),
    )
    .query(async ({ input, ctx }) => {
      const email = ctx.session.user.email;
      if (!email) {
        throw new Error("User email not found");
      }

      return await ctx.prisma.chart.create({
        data: {
          project: { connect: { id: input.projectId } },
          name: input.name,
          chartType: input.chartType,
          query: input.query,
          chartConfig: input.chartConfig,
          createdBy: email,
        },
      });
    }),
  executeQuery: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        chartId: z.string(),
        from: z.date().optional(),
        to: z.date().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const chart = await ctx.prisma.chart.findUniqueOrThrow({
        where: { id: input.chartId, projectId: input.projectId },
      });

      const parsedQuery = sqlInterface.parse(chart.query);

      return await executeQuery(ctx.prisma, input.projectId, parsedQuery);
    }),
  scores: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await ctx.prisma.$queryRawUnsafe<
        {
          date_trunc: Date;
          values: {
            [key: string]: number;
          } | null;
        }[]
      >(`
      WITH timeseries AS (
        SELECT
          date_trunc('${
            dateTimeAggregationSettings[input.agg].date_trunc
          }', dt) as date_trunc
        FROM generate_series(
          NOW() - INTERVAL '${input.agg}', NOW(), INTERVAL '1 minute'
        ) as dt
        WHERE dt > NOW() - INTERVAL '${input.agg}'
        GROUP BY 1
      ),
      metrics AS (
        SELECT 
          date_trunc('${
            dateTimeAggregationSettings[input.agg].date_trunc
          }', scores.timestamp) as date_trunc,
          scores.name as metric_name,
          AVG(value) as avg_value
        FROM scores
        LEFT JOIN traces ON scores.trace_id = traces.id
        WHERE scores.timestamp > NOW() - INTERVAL '${input.agg}'
        AND traces.project_id = '${input.projectId}'
        GROUP BY 1,2
      ),
      json_metrics AS (
        SELECT
          date_trunc,
          jsonb_object_agg(metric_name, avg_value) as values
        FROM metrics
        GROUP BY 1
      )
      SELECT
        timeseries.date_trunc,
        json_metrics.values as values
      FROM timeseries
      LEFT JOIN json_metrics ON timeseries.date_trunc = json_metrics.date_trunc
      ORDER BY 1
      `);

      return output.map((row) => ({
        ...row,
        values: row.values
          ? Object.entries(row.values).map(([label, value]) => ({
              label: "avg_" + label,
              value,
            }))
          : [],
        ts: row.date_trunc.getTime(),
      }));
    }),
});
