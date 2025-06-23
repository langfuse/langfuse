import { z } from "zod/v4";
import { singleFilter } from "@langfuse/shared";

export type ViewDeclarationType = z.infer<typeof viewDeclaration>;
export type DimensionsDeclarationType = z.infer<
  typeof viewDeclaration
>["dimensions"];

export const viewDeclaration = z.object({
  name: z.string(),
  description: z.string(),
  // This is the basic statement that we query from. Usually, this should be the view_name + FINAL or a more complex subquery.
  baseCte: z.string(),
  dimensions: z.record(
    z.string(),
    z.object({
      sql: z.string(),
      alias: z.string().optional(),
      relationTable: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      unit: z.string().optional(),
    }),
  ),
  measures: z.record(
    z.string(),
    z.object({
      sql: z.string(),
      alias: z.string().optional(),
      relationTable: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      unit: z.string().optional(),
    }),
  ),
  tableRelations: z.record(
    z.string(),
    z.object({
      name: z.string(),
      joinConditionSql: z.string(),
      timeDimension: z.string(),
    }),
  ),
  // Segments are used to apply "constant" filters to the query. For example, if we only want one type of observations.
  segments: z.array(singleFilter),
  timeDimension: z.string(),
});

export const stringDateTime = z.string().datetime({ offset: true });

export const views = z.enum([
  "traces",
  "observations",
  "scores-numeric",
  "scores-categorical",
  // "sessions",
  // "users",
]);

export const dimension = z.object({
  field: z.string(),
});

export const metricAggregations = z.enum([
  "sum",
  "avg",
  "count",
  "max",
  "min",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "histogram",
]);

export const metric = z.object({
  measure: z.string(),
  aggregation: metricAggregations,
});

export const granularities = z.enum([
  "auto",
  "minute",
  "hour",
  "day",
  "week",
  "month",
]);

export type QueryType = z.infer<typeof query>;

export const query = z
  .object({
    view: views,
    dimensions: z.array(dimension),
    metrics: z.array(metric),
    filters: z.array(singleFilter),
    timeDimension: z
      .object({
        // TODO: We may want to extend this and allow custom intervals like 3h in the future.
        // auto tries to bin the data into approximately 50 buckets given the time range
        granularity: granularities,
      })
      .nullable(),
    fromTimestamp: stringDateTime,
    toTimestamp: stringDateTime,
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]),
        }),
      )
      .nullable(),
    // Chart configuration for chart-specific settings like histogram bins
    chartConfig: z
      .object({
        type: z.string(),
        bins: z.number().int().min(1).max(100).optional(),
        row_limit: z.number().int().positive().lte(1000).optional(),
      })
      .optional(),
  })
  .refine(
    (query) =>
      // Ensure fromTimestamp is before toTimestamp
      new Date(query.fromTimestamp) < new Date(query.toTimestamp),
  );
