import {
  dateTimeAggregationSettings,
  dateTimeAggregationOptions,
} from "@/src/utils/types";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

export const dashboardRouter = createTRPCRouter({
  llmCalls: publicProcedure
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

      console.log(output);

      return output.map((row) => ({
        ...row,
        ts: row.date_trunc.getTime(),
      }));
    }),
  traces: publicProcedure
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

      console.log(output);

      return output.map((row) => ({
        ...row,
        ts: row.date_trunc.getTime(),
      }));
    }),
});
