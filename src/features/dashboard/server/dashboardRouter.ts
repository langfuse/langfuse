import {
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseriesAggregation";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const dashboardRouter = createTRPCRouter({
  llmCalls: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      })
    )
    .query(async ({ input, ctx }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await ctx.prisma.$queryRawUnsafe<
        {
          date_trunc: Date;
          value: number;
        }[]
      >(`
      WITH timeseries AS (
        SELECT
          date_trunc('${
            dateTimeAggregationSettings[input.agg].date_trunc
          }', dt) as date_trunc,
          0 as value
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
          }', start_time) as date_trunc,
          count(*)::integer as value
        FROM observations
        LEFT JOIN traces ON observations.trace_id = traces.id

        WHERE
        type = 'LLMCALL'
        AND start_time > NOW() - INTERVAL '${input.agg}'
        AND traces.project_id = '${input.projectId}'

        GROUP BY 1
      )

      SELECT
        timeseries.date_trunc,
        COALESCE(sum(metrics.value), 0)::integer as value
      FROM timeseries
      LEFT JOIN metrics ON timeseries.date_trunc = metrics.date_trunc
      GROUP BY 1
      ORDER BY 1
      `);

      return output.map((row) => ({
        ...row,
        values: [
          {
            label: "count",
            value: row.value,
          },
        ],
        ts: row.date_trunc.getTime(),
      }));
    }),
  traces: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      })
    )
    .query(async ({ input, ctx }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await ctx.prisma.$queryRawUnsafe<
        {
          date_trunc: Date;
          value: number;
        }[]
      >(`
      WITH timeseries AS (
        SELECT
          date_trunc('${
            dateTimeAggregationSettings[input.agg].date_trunc
          }', dt) as date_trunc,
          0 as value
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
          }', timestamp) as date_trunc,
          count(*)::integer as value
        FROM traces
        WHERE timestamp > NOW() - INTERVAL '${input.agg}'
        AND traces.project_id = '${input.projectId}'
        GROUP BY 1
      )

      SELECT
        timeseries.date_trunc,
        COALESCE(sum(metrics.value), 0)::integer as value
      FROM timeseries
      LEFT JOIN metrics ON timeseries.date_trunc = metrics.date_trunc
      GROUP BY 1
      ORDER BY 1
      `);

      return output.map((row) => ({
        ...row,
        values: [
          {
            label: "count",
            value: row.value,
          },
        ],
        ts: row.date_trunc.getTime(),
      }));
    }),
  scores: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      })
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
