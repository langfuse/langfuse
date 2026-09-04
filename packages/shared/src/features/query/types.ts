import { z } from "zod";
import { singleFilter } from "../../interfaces/filters";

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
  "uniq",
]);

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
      aggregationFunction: z.string().optional(),
      // Override for filter generation when the dimension uses complex SQL/aggregation.
      // where: column expressions OR'd together for pre-aggregation row pruning.
      // The exact match uses dimension.sql (the row-level expression).
      filterSql: z
        .object({
          where: z.array(z.string()),
        })
        .optional(),
      highCardinality: z.boolean().optional(),
      uiHidden: z.boolean().optional(),
      // Expands dimension.sql independently with arrayJoin(), producing one row
      // per array element. Duplicate elements duplicate the source row; use
      // arrayDistinct(...) in sql when the intended grain is entity + distinct value.
      explodeArray: z.boolean().optional(),
      // Expands dimension.sql and valuesSql together in one ARRAY JOIN, pairing
      // elements by position and exposing valueAlias to a dependent measure.
      // Only one pairExpand dimension is supported per query, and it cannot be filtered.
      pairExpand: z
        .object({
          valuesSql: z.string(),
          valueAlias: z.string(),
        })
        .optional(),
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
      // Natural aggregation the widget builder preselects when the user
      // switches to this measure (e.g. `sum` for toolCalls, where a carried-over
      // `count` would count observations instead of tool calls). UI-only
      // default; the query builder never reads it.
      defaultAggregation: metricAggregations.optional(),
      aggs: z.record(z.string(), z.string()).optional(),
      // Override query semantics for specific user-selected aggregations while
      // keeping the base declaration as the UI/default compatibility contract.
      aggregationOverrides: z
        .record(
          z.string(),
          z.object({
            sql: z.string(),
            type: z.string().optional(),
            aggs: z.record(z.string(), z.string()).optional(),
            queryAggregation: metricAggregations.optional(),
          }),
        )
        .optional(),
      // Auto-includes a dimension needed to evaluate the measure, including its
      // explodeArray or pairExpand behavior and resulting aliases.
      requiresDimension: z.string().optional(),
    }),
  ),
  tableRelations: z.record(
    z.string(),
    z.object({
      name: z.string(),
      joinConditionSql: z.string(),
      timeDimension: z.string(),
      useFinal: z.boolean().optional(),
    }),
  ),
  // Segments are used to apply "constant" filters to the query. For example, if we only want one type of observations.
  segments: z.array(singleFilter),
  timeDimension: z.string(),
  // When set, adds a subquery filter to restrict rows to those whose "root event"
  // (matching the condition) has timeDimension in the query window.
  rootEventCondition: z
    .object({
      // The column used to match root entities between outer query and subquery (e.g., "trace_id").
      column: z.string(),
      // Fully qualified, self-contained SQL condition identifying root events.
      condition: z.string(),
    })
    .optional(),
});

const stringDateTime = z.iso.datetime({ offset: true });

export const views = z.enum([
  "traces",
  "observations",
  "scores-numeric",
  "scores-categorical",
  "scores-boolean",
  // "sessions",
  // "users",
]);

// Public v2 API views - excludes "traces". Internal dashboard queries still
// support the events-backed v2 traces declaration for legacy widget parity.
export const viewsV2 = z.enum([
  "observations",
  "scores-numeric",
  "scores-categorical",
  "scores-boolean",
]);

/**
 * Internal-only view name (see `dataModel.ts`), deliberately NOT a member of
 * `views`/`viewsV2` — those are iterated by the public metrics API and the
 * widget-builder view picker, and this powers only one internal call site.
 * Unioned onto the internal `query` schema below instead.
 */
export const SCORES_LISTABLE_COUNT_VIEW = "scores-listable-count" as const;

/**
 * Persisted dashboard-widget view ids → query view ids. Lives here (not with
 * the server-only DashboardService types) so client code can classify a stored
 * widget; DashboardService's Prisma-keyed map is this constant, so the two
 * cannot drift.
 */
export const persistedWidgetViewToQueryView = {
  TRACES: "traces",
  OBSERVATIONS: "observations",
  SCORES_NUMERIC: "scores-numeric",
  SCORES_BOOLEAN: "scores-boolean",
  SCORES_CATEGORICAL: "scores-categorical",
} as const satisfies Record<string, z.infer<typeof views>>;

export const viewVersions = z.enum(["v1", "v2"]);
export type ViewVersion = z.infer<typeof viewVersions>;

export const dimension = z.object({
  field: z.string(),
});

/** MeasureDefinition is a single `measures` entry on a ViewDeclaration. */
export type MeasureDefinition = ViewDeclarationType["measures"][string];

/** getValidAggregationsForMeasureType returns the aggregations valid for a measure type: every aggregation for numeric types, or `count`/`uniq` otherwise. */
export function getValidAggregationsForMeasureType(
  measureType: string | undefined,
): z.infer<typeof metricAggregations>[] {
  if (
    measureType === "integer" ||
    measureType === "decimal" ||
    measureType === "number"
  ) {
    return [...metricAggregations.options];
  }
  return ["count", "uniq"];
}

export const metric = z.object({
  measure: z.string(),
  aggregation: metricAggregations,
});

/** granularities is the superset of time-bucket tokens: the 6 base options plus the 10 Monitor window increments. */
export const granularities = z.enum([
  "auto",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "5m",
  "10m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
  "2d",
  "1w",
]);

export type QueryType = z.infer<typeof query>;

export const query = z
  .object({
    // See `SCORES_LISTABLE_COUNT_VIEW`'s doc comment: unioned on here (the
    // internal query schema) rather than added to `views` itself, so it
    // stays out of the public metrics API and the widget-builder view
    // picker, both of which read `views`/`viewsV2` directly.
    view: z.union([views, z.literal(SCORES_LISTABLE_COUNT_VIEW)]),
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
    // Entity dimension for bucketing by a categorical field (e.g., experimentName).
    // IMPORTANT: Unlike timeDimension which has implicit bucket limits (24 hours/day),
    // entityDimension has NO cardinality guarantee. Callers MUST filter the same
    // entity field in WHERE before GROUP BY runs (max ~50 values).
    // Without this pre-filtering, GROUP BY on high-cardinality columns will be slow/OOM.
    entityDimension: z
      .object({
        field: z.string(), // e.g., "experimentName"
      })
      .nullish(),
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
    // Chart configuration for chart-specific settings like histogram bins and pivot table dimensions
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
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    (query) =>
      // timeDimension and entityDimension are mutually exclusive
      !(query.timeDimension && query.entityDimension),
    { message: "timeDimension and entityDimension are mutually exclusive" },
  );

export const useEventsTableSchema = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((val) => val === "true" || val === true);
