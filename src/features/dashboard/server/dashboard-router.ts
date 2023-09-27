import {
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const dashboardRouter = createTRPCRouter({
  generations: protectedProjectProcedure
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
        type = 'GENERATION'
        AND start_time > NOW() - INTERVAL '${input.agg}'
        AND traces.project_id = '${input.projectId}'
        AND observations.project_id = '${input.projectId}'

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
      }),
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
  tokenUsage: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        agg: z.enum(dateTimeAggregationOptions),
      }),
    )
    .query(async ({ input, ctx }) => {
      const output = await ctx.prisma.$queryRawUnsafe<
        {
          date: Date;
          promptTokens: { [model: string]: number } | null;
          completionTokens: { [model: string]: number } | null;
          totalTokens: { [model: string]: number } | null;
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
        token_usage AS (
          SELECT 
            date_trunc('${
              dateTimeAggregationSettings[input.agg].date_trunc
            }', start_time) as date_trunc,
            COALESCE(model, 'undefined') model,
            sum(prompt_tokens) prompt_tokens,
            sum(completion_tokens) completion_tokens,
            sum(total_tokens) total_tokens
          from observations
          WHERE start_time > NOW() - INTERVAL '${input.agg}'
          AND project_id = '${input.projectId}'
          GROUP BY 1,2
          HAVING sum(prompt_tokens) > 0 OR sum(completion_tokens) > 0 or sum(total_tokens) > 0
          ORDER BY 1,2
        ),
        json_metrics as (
          SELECT
            date_trunc,
            jsonb_object_agg(model, prompt_tokens) as prompt_tokens,
            jsonb_object_agg(model, completion_tokens) as completion_tokens,
            jsonb_object_agg(model, total_tokens) as total_tokens
          from token_usage
          GROUP BY 1
        )
        SELECT
          timeseries.date_trunc as "date",
          prompt_tokens "promptTokens",
          completion_tokens "completionTokens",
          total_tokens "totalTokens"
        FROM timeseries
        LEFT JOIN json_metrics ON timeseries.date_trunc = json_metrics.date_trunc
      `);

      return output.map((row) => ({
        ...row,
        ts: row.date.getTime(),
      }));
    }),
});
