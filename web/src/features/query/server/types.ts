import { z } from "zod";

export type ViewDeclarationType = z.infer<typeof viewDeclaration>;
export type DimensionsDeclarationType = z.infer<
  typeof viewDeclaration
>["dimensions"];

// TODO: Do we want to type filters here to provide specific operators for strings/arrays/numbers?
// IMO having one filter type that covers everything could be perfectly fine.
export const filter = z.object({
  field: z.string(),
  operator: z.enum([
    "eq",
    "ne",
    "lt",
    "lte",
    "gt",
    "gte",
    "in",
    "not_in",
    "like",
    "not_like",
    "has_any",
    "has_all",
  ]),
  value: z.string(),
});

export const viewDeclaration = z.object({
  name: z.string(),
  // This is the basic statement that we query from. Usually, this should be the view_name + FINAL or a more complex subquery.
  baseCte: z.string(),
  dimensions: z.record(
    z.object({
      sql: z.string(),
      alias: z.string().optional(),
      type: z.enum(["string", "number", "bool"]),
      relationTable: z.string().optional(),
    }),
  ),
  measures: z.record(
    z.object({
      sql: z.string(),
      alias: z.string().optional(),
      type: z.enum(["count", "sum", "number"]),
      relationTable: z.string().optional(),
    }),
  ),
  tableRelations: z.record(
    z.object({
      name: z.string(),
      joinCondition: z.string(),
      timeDimension: z.string(),
    }),
  ),
  // Segments are used to apply "constant" filters to the query. For example, if we only want one type of observations.
  segments: z.array(filter),
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

export const metric = z.object({
  measure: z.string(),
  aggregation: z.enum([
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
  ]),
});

export type QueryType = z.infer<typeof query>;

export const query = z
  .object({
    view: views,
    dimensions: z.array(dimension),
    metrics: z.array(metric),
    filters: z.array(filter),
    timeDimension: z
      .object({
        // TODO: We may want to extend this and allow custom intervals like 3h in the future.
        // auto tries to bin the data into approximately 50 buckets given the time range
        granularity: z.enum(["auto", "minute", "hour", "day", "week"]),
      })
      .nullable(),
    fromTimestamp: stringDateTime,
    toTimestamp: stringDateTime,
    limit: z.number().int().positive().default(50),
    page: z.number().int().nonnegative().default(0),
  })
  .refine(
    (query) =>
      // Ensure fromTimestamp is before toTimestamp
      new Date(query.fromTimestamp) < new Date(query.toTimestamp),
  );
