import {
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseriesAggregation";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { prisma } from "@/src/server/db";

export const dashboardRouter = createTRPCRouter({
  llmCalls: protectedProcedure
    .input(
      z.object({
        agg: z.enum(dateTimeAggregationOptions),
      })
    )
    .query(async ({ input }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await prisma.$queryRawUnsafe<
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
        WHERE type = 'LLMCALL' AND start_time > NOW() - INTERVAL '${input.agg}'
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
  traces: protectedProcedure
    .input(
      z.object({
        agg: z.enum(dateTimeAggregationOptions),
      })
    )
    .query(async ({ input }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await prisma.$queryRawUnsafe<
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
  scores: protectedProcedure
    .input(
      z.object({
        agg: z.enum(dateTimeAggregationOptions),
      })
    )
    .query(async ({ input }) => {
      // queryRawUnsafe to add input.agg to the WHERE clause
      const output = await prisma.$queryRawUnsafe<
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
          }', timestamp) as date_trunc,
          name as metric_name,
          AVG(value) as avg_value
        FROM scores
        WHERE timestamp > NOW() - INTERVAL '${input.agg}'
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
