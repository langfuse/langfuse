/**
 * The steps every dashboard view query shares, whether it compiles through
 * the query AST (the v2 observations, traces and score views) or is assembled as SQL
 * text (`buildSqlText`, `sqlTextQuery.ts`): mapping a query's dimensions, metrics,
 * bucket and order by onto a view declaration, and validating its filters and
 * relations, all throwing `InvalidRequestError` for what the view rejects.
 * The AST-only steps build the outer select, its `group by … order by …
 * [with fill …] [limit n]` and the aggregates, and compile the result for a
 * project. Each view's FROM, joins and WHERE live in its own module
 * (`scoresQuery.ts`, `eventsObservationsQuery.ts`, `eventsTracesQuery.ts`).
 */
import {
  type AliasableExpression,
  type AliasedSelectQueryBuilder,
  type Expression,
  type ExpressionBuilder,
  type SelectQueryBuilder,
} from "kysely";
import { type z } from "zod";
import {
  type QueryType,
  type ViewDeclarationType,
  type metricAggregations,
  type granularities,
  type ViewVersion,
  query as queryModel,
  getValidAggregationsForMeasureType,
} from "../types";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { compileClickhouseQuery } from "../../../server/query-ast/compile";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  aliasRef,
  anyValue,
  histogram,
  interval,
  literal,
  quantile,
  toDate,
  toFloat64,
  toMonday,
  toStartOfHour,
  toStartOfInterval,
  toStartOfMinute,
  toStartOfMonth,
  typedValue,
  uniq,
  withFill,
  type IntervalUnit,
  type IntervalValue,
} from "../../../server/query-ast/extensions";
import { type QueryLevel } from "./registryEntry";
import {
  getCompatibleFilterTypes,
  isFilterColumnType,
  type CompatibleFilterType,
  type FilterColumnType,
} from "../../../server/queries/clickhouse-sql/filterTypeCompatibility";

export type AppliedDimensionType = {
  /** The dimension's key in the view. */
  name: string;
  table: string;
  sql: string;
  alias?: string;
  relationTable?: string;
  aggregationFunction?: string;
  explodeArray?: boolean;
  pairExpand?: { valuesSql: string; valueAlias: string };
};

export type AppliedMetricType = {
  sql: string;
  aggregation: z.infer<typeof metricAggregations>;
  queryAggregation?: z.infer<typeof metricAggregations>;
  alias?: string;
  relationTable?: string;
  aggs?: Record<string, string>;
  measureName: string; // Original measure name for lookups
  requiresDimension?: string;
};

const isQueryArrayDimensionType = (dimensionType: string | undefined) =>
  dimensionType === "string[]" || dimensionType === "arrayString";

const getFilterColumnTypeForQueryDimension = (
  dimensionType: string | undefined,
): FilterColumnType | null => {
  if (isQueryArrayDimensionType(dimensionType)) {
    return "arrayOptions";
  }

  if (dimensionType === "null" || dimensionType === "positionInTrace") {
    return null;
  }

  return isFilterColumnType(dimensionType) ? dimensionType : null;
};

const getCompatibleFilterTypesForQueryDimension = (
  dimensionType: string | undefined,
): readonly CompatibleFilterType[] | null => {
  const filterColumnType = getFilterColumnTypeForQueryDimension(dimensionType);

  if (!filterColumnType) {
    return null;
  }

  // Query array dimensions are ClickHouse Array(String) expressions. The shared
  // table also allows stringOptions for legacy UI array columns, but metrics
  // queries must use arrayOptions so QueryBuilder generates hasAny/hasAll in SQL.
  if (isQueryArrayDimensionType(dimensionType)) {
    return ["arrayOptions"];
  }

  return getCompatibleFilterTypes(filterColumnType);
};

const formatExpectedFilterTypes = (
  filterTypes: readonly CompatibleFilterType[],
) =>
  filterTypes.length === 1
    ? `'${filterTypes[0]}'`
    : filterTypes
        .map((filterType) => `'${filterType}'`)
        .join(filterTypes.length === 2 ? " or " : ", ");

export type AppliedBucketingDimension =
  | { type: "none" }
  | {
      type: "time";
      bucketDimensionAlias: "time_dimension";
      granularity: z.infer<typeof granularities>;
    }
  | {
      type: "entity";
      bucketDimensionAlias: "entity_dimension";
      field: string;
      dimension: AppliedDimensionType;
    };

const MINUTE_MS = 60_000;

export const HOUR_MS = 60 * MINUTE_MS;

const DAY_MS = 24 * HOUR_MS;

/** WITH FILL step per granularity; approxMs never exceeds the real step, so bucket estimates err high. */
export const WITH_FILL_STEPS: Record<
  Exclude<z.infer<typeof granularities>, "auto">,
  { sql: string; approxMs: number }
> = {
  minute: { sql: "INTERVAL 1 MINUTE", approxMs: MINUTE_MS },
  hour: { sql: "INTERVAL 1 HOUR", approxMs: HOUR_MS },
  day: { sql: "INTERVAL 1 DAY", approxMs: DAY_MS },
  week: { sql: "INTERVAL 1 WEEK", approxMs: 7 * DAY_MS },
  month: { sql: "INTERVAL 1 MONTH", approxMs: 28 * DAY_MS },
  "5m": { sql: "INTERVAL 5 MINUTE", approxMs: 5 * MINUTE_MS },
  "10m": { sql: "INTERVAL 10 MINUTE", approxMs: 10 * MINUTE_MS },
  "15m": { sql: "INTERVAL 15 MINUTE", approxMs: 15 * MINUTE_MS },
  "30m": { sql: "INTERVAL 30 MINUTE", approxMs: 30 * MINUTE_MS },
  "1h": { sql: "INTERVAL 1 HOUR", approxMs: HOUR_MS },
  "2h": { sql: "INTERVAL 2 HOUR", approxMs: 2 * HOUR_MS },
  "4h": { sql: "INTERVAL 4 HOUR", approxMs: 4 * HOUR_MS },
  "1d": { sql: "INTERVAL 1 DAY", approxMs: DAY_MS },
  "2d": { sql: "INTERVAL 2 DAY", approxMs: 2 * DAY_MS },
  "1w": { sql: "INTERVAL 7 DAY", approxMs: 7 * DAY_MS },
};

/**
 * A `Date` bound as `{p:DateTime64(3, 'UTC')}` with its UTC wall-clock
 * string, as the string builder binds time bounds; ClickHouse compares it
 * exactly against the `DateTime64(6)` / `DateTime64(3)` columns.
 */
export const utcDateTime = (date: Date) =>
  typedValue<Date>(
    convertDateToClickhouseDateTime(date),
    "DateTime64(3, 'UTC')",
  );

/** A query's time window, bound as {@link utcDateTime}. */
export type TimeWindow = { from: Expression<Date>; to: Expression<Date> };

/** A time granularity after `auto` is resolved to one of the others. */
type Granularity = Exclude<z.infer<typeof granularities>, "auto">;

/** `toStartOfInterval(t, <count> <unit>)`, filled `<count> <unit>` apart. */
const everyInterval = (count: number, unit: IntervalUnit) => ({
  bucket: (t: Expression<Date>) => toStartOfInterval(t, interval(count, unit)),
  step: () => interval(count, unit),
});

/** The time bucket of each granularity, and its WITH FILL step. */
const TIME_BUCKETS: Record<
  Granularity,
  {
    bucket: (t: Expression<Date>) => AliasableExpression<Date>;
    step: () => Expression<IntervalValue>;
  }
> = {
  minute: { bucket: toStartOfMinute, step: () => interval(1, "minute") },
  hour: { bucket: toStartOfHour, step: () => interval(1, "hour") },
  day: { bucket: toDate, step: () => interval(1, "day") },
  week: { bucket: toMonday, step: () => interval(1, "week") },
  month: { bucket: toStartOfMonth, step: () => interval(1, "month") },
  "5m": everyInterval(5, "minute"),
  "10m": everyInterval(10, "minute"),
  "15m": everyInterval(15, "minute"),
  "30m": everyInterval(30, "minute"),
  "1h": everyInterval(1, "hour"),
  "2h": everyInterval(2, "hour"),
  "4h": everyInterval(4, "hour"),
  "1d": everyInterval(1, "day"),
  "2d": everyInterval(2, "day"),
  "1w": everyInterval(7, "day"),
};

/** {@link TIME_BUCKETS} of a resolved granularity; `auto` is resolved first. */
function timeBucket(granularity: z.infer<typeof granularities>) {
  if (granularity === "auto") {
    throw new Error("Granularity 'auto' must be resolved before bucketing");
  }
  return TIME_BUCKETS[granularity];
}

/**
 * `row_limit` as a `limit 25` literal. The query schema admits integers
 * 1–1000; the check keeps `literal` to integers for callers that skip it.
 */
function rowLimitLiteral(rowLimit: number) {
  if (!Number.isSafeInteger(rowLimit) || rowLimit < 0) {
    throw new QueryCompileError(
      `row_limit must be a non-negative integer, got ${rowLimit}.`,
    );
  }
  return literal(rowLimit);
}

/** Throws `InvalidRequestError` unless `view` declares every relation in `relationTables`. */
export function assertKnownRelationTables(
  view: ViewDeclarationType,
  relationTables: Iterable<string>,
) {
  for (const relationTable of relationTables) {
    if (!Object.hasOwn(view.tableRelations, relationTable)) {
      throw new InvalidRequestError(
        `Invalid relationTable: ${relationTable}. Must be one of ${Object.keys(view.tableRelations)}`,
      );
    }
  }
}

/**
 * The clauses that follow FROM … WHERE on the outermost select of an AST
 * view query (the only select at single level, the parent of the inner
 * select at two levels): `group by … order by … [with fill …] [limit n]`.
 */
type OuterClauses = {
  groupBy: Expression<unknown>[];
  orderBy: Array<{ field: string; direction: string }>;
  fill:
    | { fromDate: Date; toDate: Date; granularity: Granularity | "auto" }
    | undefined;
  rowLimit: number | undefined;
};

/** A granularity's bucket of a time value, e.g. `toDate(t)` for `day`. */
export type TimeBucketOf = (t: Expression<Date>) => AliasableExpression<Date>;

/**
 * What a time bucket truncates and an entity bucket reads, per view.
 * `perEntityTime` is the time bucket in the inner select of a two-level
 * query, built from the granularity's bucket function (the v2 traces view
 * prefers its root event's bucket); without it that bucket is
 * `any(<bucket of time>)`.
 */
export type BucketValues = {
  time: Expression<Date>;
  entity: (field: string) => AliasableExpression<unknown>;
  perEntityTime?: (bucketOf: TimeBucketOf) => AliasableExpression<unknown>;
};

/**
 * A dimension or measure in the select it sits in: as it is at level
 * `single`, `any(…)` in the inner select of a two-level query, whose rows
 * are one per grouped entity.
 */
export const atLevel = <T>(value: AliasableExpression<T>, level: QueryLevel) =>
  level === "two" ? anyValue(value) : value;

/**
 * The dimension of `dimensions` (a view's declared dimensions) a filter on
 * `column` names: `column` itself, else `name` for another `…Name` column
 * (`scoreName`, `traceName`), so a filter sent with the wrong column name
 * keeps working; `undefined` for any other column.
 */
export function filterDimensionName(
  column: string,
  dimensions: Readonly<Record<string, unknown>>,
): string | undefined {
  if (Object.hasOwn(dimensions, column)) return column;
  if (column.endsWith("Name") && Object.hasOwn(dimensions, "name"))
    return "name";
  return undefined;
}

/** Latest fill bound whose TO + one step stays below the DateTime maximum (2106-02-07T06:28:15Z). */
const MAX_WITH_FILL_TO_MS = Date.UTC(2106, 0, 1);

const MAX_WITH_FILL_BUCKETS = 50_000;

export function applyBucketingDimension(
  query: QueryType,
  view: ViewDeclarationType,
  version: ViewVersion,
): AppliedBucketingDimension {
  if (query.timeDimension && query.entityDimension) {
    throw new InvalidRequestError(
      "timeDimension and entityDimension are mutually exclusive",
    );
  }

  if (query.timeDimension) {
    const granularity =
      query.timeDimension.granularity === "auto"
        ? determineTimeGranularity(query.fromTimestamp, query.toTimestamp)
        : query.timeDimension.granularity;

    return {
      type: "time",
      bucketDimensionAlias: "time_dimension",
      granularity,
    };
  }

  if (query.entityDimension) {
    if (version !== "v2") {
      throw new InvalidRequestError(
        "entityDimension is only supported for v2 queries",
      );
    }

    const field = query.entityDimension.field;
    const dimension = getEntityDimensionDefinition(view, field);

    // Entity buckets reuse view dimensions for SQL/relation metadata, but they are
    // not regular dimensions. Only declared relations are allowed; do not infer
    // broader join paths or propagation behavior here.
    if (
      dimension.relationTable &&
      !Object.hasOwn(view.tableRelations, dimension.relationTable)
    ) {
      throw new InvalidRequestError(
        `Invalid relationTable for entity dimension ${field}: ${dimension.relationTable}. Must be one of ${Object.keys(view.tableRelations)}`,
      );
    }

    return {
      type: "entity",
      bucketDimensionAlias: "entity_dimension",
      field,
      dimension: {
        ...dimension,
        name: field,
        table: dimension.relationTable || view.name,
        explodeArray: dimension.explodeArray,
        pairExpand: dimension.pairExpand,
      },
    };
  }

  return { type: "none" };
}

function getEntityDimensionDefinition(
  view: ViewDeclarationType,
  field: string,
) {
  const dimension = Object.hasOwn(view.dimensions, field)
    ? view.dimensions[field]
    : undefined;
  if (!dimension) {
    throw new InvalidRequestError(
      `Invalid entity dimension: ${field}. Must be one of ${Object.keys(view.dimensions)}`,
    );
  }

  if (
    dimension.explodeArray ||
    dimension.pairExpand ||
    dimension.aggregationFunction
  ) {
    throw new InvalidRequestError(
      `Invalid entity dimension: ${field}. Entity dimensions must be scalar view dimensions.`,
    );
  }

  return dimension;
}

export function mapDimensions(
  dimensions: Array<{ field: string }>,
  view: ViewDeclarationType,
): AppliedDimensionType[] {
  return dimensions.map((dimension) => {
    if (!Object.hasOwn(view.dimensions, dimension.field)) {
      throw new InvalidRequestError(
        `Invalid dimension ${dimension.field}. Must be one of ${Object.keys(view.dimensions)}`,
      );
    }
    const dim = view.dimensions[dimension.field];
    return {
      ...dim,
      name: dimension.field,
      table: dim.relationTable || view.name,
      explodeArray: dim.explodeArray,
      pairExpand: dim.pairExpand,
    };
  });
}

export function mapMetrics(
  metrics: Array<{
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
  }>,
  view: ViewDeclarationType,
): AppliedMetricType[] {
  return metrics.map((metric) => {
    if (!Object.hasOwn(view.measures, metric.measure)) {
      throw new InvalidRequestError(
        `Invalid metric ${metric.measure}. Must be one of ${Object.keys(view.measures)}`,
      );
    }
    const measureDef = view.measures[metric.measure];
    const aggregationOverride =
      measureDef.aggregationOverrides?.[metric.aggregation];
    const resolvedMeasureDef = aggregationOverride
      ? { ...measureDef, ...aggregationOverride }
      : measureDef;
    const validAggs = getValidAggregationsForMeasureType(
      resolvedMeasureDef.type,
    );
    if (!validAggs.includes(metric.aggregation)) {
      throw new InvalidRequestError(
        `Aggregation "${metric.aggregation}" is not valid for measure "${metric.measure}" (type: ${resolvedMeasureDef.type}). Valid aggregations: ${validAggs.join(", ")}`,
      );
    }
    return {
      ...resolvedMeasureDef,
      aggregation: metric.aggregation,
      aggs: resolvedMeasureDef.aggs,
      measureName: metric.measure,
    };
  });
}

/**
 * `appliedDimensions` plus the dimensions required to evaluate a measure,
 * whether the dimension uses pairExpand or explodeArray.
 * e.g. costByType.requiresDimension = "costType": without that dimension the
 * ARRAY JOIN is never emitted and ClickHouse errors with "unknown column cost_value".
 * toolCallInvocations similarly needs calledToolNames so arrayJoin is emitted
 * and its per-tool result alias is in scope.
 */
export function withRequiredDimensions(
  appliedDimensions: AppliedDimensionType[],
  appliedMetrics: AppliedMetricType[],
  view: ViewDeclarationType,
): AppliedDimensionType[] {
  const dimensions = [...appliedDimensions];
  for (const metric of appliedMetrics) {
    if (
      metric.requiresDimension &&
      !dimensions.some((d) => d.alias === metric.requiresDimension)
    ) {
      const requiredDimDef = view.dimensions[metric.requiresDimension];
      if (requiredDimDef) {
        dimensions.push({
          ...requiredDimDef,
          name: metric.requiresDimension,
          table: requiredDimDef.relationTable || view.name,
          explodeArray: requiredDimDef.explodeArray,
          pairExpand: requiredDimDef.pairExpand,
        });
      }
    }
  }
  return dimensions;
}

/**
 * Throws `InvalidRequestError` for a filter whose type the view's column
 * does not take. Metadata takes `stringObject`, and also `numberObject`
 * with `numericMetadata`: only views whose filters are lowered by the
 * events predicate lowering (the v2 observations view) compare metadata
 * as numbers.
 */
export function validateFilters(
  filters: z.infer<typeof queryModel>["filters"],
  view: ViewDeclarationType,
  { numericMetadata = false }: { numericMetadata?: boolean } = {},
) {
  for (const filter of filters) {
    // Validate filters on dimension fields
    const dimension = resolveDimension(filter.column, view);

    if (dimension) {
      if (dimension.pairExpand) {
        throw new InvalidRequestError(
          `Field '${filter.column}' cannot be used as a filter.`,
        );
      }

      const compatibleFilterTypes = getCompatibleFilterTypesForQueryDimension(
        dimension.type,
      );

      if (!compatibleFilterTypes) {
        throw new InvalidRequestError(
          `Invalid query dimension '${filter.column}': Unsupported dimension type '${dimension.type ?? "undefined"}'.`,
        );
      }

      if (filter.type === "null") {
        continue;
      }

      if (!compatibleFilterTypes.includes(filter.type)) {
        throw new InvalidRequestError(
          `Invalid filter for field '${filter.column}': Filter type '${filter.type}' is not supported for dimension type '${dimension.type ?? "string"}'. ` +
            `Expected ${formatExpectedFilterTypes(compatibleFilterTypes)}.`,
        );
      }

      if (filter.type === "arrayOptions" && !Array.isArray(filter.value)) {
        throw new InvalidRequestError(
          `Invalid filter for field '${filter.column}': arrayOptions type requires an array of values, not '${typeof filter.value}'.`,
        );
      }
    }

    // Special validation for time dimension filters
    else if (filter.column === view.timeDimension) {
      const compatibleFilterTypes: CompatibleFilterType[] = ["datetime"];

      if (filter.type === "null") {
        continue;
      }

      if (!compatibleFilterTypes.includes(filter.type)) {
        throw new InvalidRequestError(
          `Invalid filter for field '${filter.column}': Filter type '${filter.type}' is not supported for time dimension '${view.timeDimension}'. ` +
            `Expected ${formatExpectedFilterTypes(compatibleFilterTypes)}.`,
        );
      }
    }

    // Metadata filters: the `singleFilter` schema already requires `key`
    // and a value of the filter type's kind, so only the type is checked.
    else if (filter.column === "metadata") {
      const acceptedTypes: CompatibleFilterType[] = numericMetadata
        ? ["stringObject", "numberObject"]
        : ["stringObject"];
      if (!acceptedTypes.includes(filter.type)) {
        throw new InvalidRequestError(
          `Invalid filter for field 'metadata': Metadata filters require type ${formatExpectedFilterTypes(acceptedTypes)} with a 'key' property, not '${filter.type}'. ` +
            `Example: {"column": "metadata", "type": "stringObject", "key": "environment", "operator": "=", "value": "production"}`,
        );
      }
    }
  }
}

/**
 * Resolves a filter column to a dimension, with fallback for *Name columns.
 */
export function resolveDimension(
  filterColumn: string,
  view: ViewDeclarationType,
): ViewDeclarationType["dimensions"][string] | undefined {
  const name = filterDimensionName(filterColumn, view.dimensions);
  return name === undefined ? undefined : view.dimensions[name];
}

/**
 * The relation tables the entity bucket, `appliedDimensions` and
 * `appliedMetrics` read, in order of first use. A view that filters on a
 * relation adds its filters' relations after these.
 */
export function collectRelationTables(
  appliedDimensions: AppliedDimensionType[],
  appliedMetrics: AppliedMetricType[],
  appliedBucketingDimension: AppliedBucketingDimension,
) {
  const relationTables = new Set<string>();

  // The bucket dimension is a separate first-class grouping axis. If an entity
  // bucket is relation-backed, include its declared relation without adding it to
  // appliedDimensions and inheriting regular-dimension behavior.
  if (
    appliedBucketingDimension.type === "entity" &&
    appliedBucketingDimension.dimension.relationTable
  ) {
    relationTables.add(appliedBucketingDimension.dimension.relationTable);
  }
  appliedDimensions.forEach((dimension) => {
    if (dimension.relationTable) {
      relationTables.add(dimension.relationTable);
    }
  });
  appliedMetrics.forEach((metric) => {
    if (metric.relationTable) {
      relationTables.add(metric.relationTable);
    }
  });
  return relationTables;
}

export function canUseSingleLevelQuery(
  appliedDimensions: AppliedDimensionType[],
  appliedMetrics: AppliedMetricType[],
): boolean {
  // Single-level query requires:
  // 1. All metrics are single-level compatible, which means either:
  //    a. They have aggs configuration (@@AGGN@@ templates that resolve to function
  //       calls), OR
  //    b. They are pairExpand value-alias measures (requiresDimension is set). These
  //       reference a plain column brought into scope by the ARRAY JOIN clause and
  //       work correctly with a direct sum()/avg() in a single SELECT.
  // 2. No custom aggregation functions on dimensions
  // Measures without either (like uniq(scores.id)) must use the two-level approach.
  const allMetricsHaveAggs =
    appliedMetrics.length === 0 ||
    appliedMetrics.every(
      (m) => m.aggs !== undefined || m.requiresDimension !== undefined,
    );

  // Check if any dimension has custom aggregation
  const hasCustomDimensionAgg = appliedDimensions.some(
    (d) => d.aggregationFunction !== undefined,
  );

  return allMetricsHaveAggs && !hasCustomDimensionAgg;
}

/** The query's one pairExpand dimension, if any. */
export function pairExpandDimension(
  appliedDimensions: AppliedDimensionType[],
): AppliedDimensionType | undefined {
  const pairs = appliedDimensions.filter((d) => d.pairExpand);
  // Multiple pairExpand dimensions would produce separate ARRAY JOIN clauses
  // which ClickHouse executes as a cartesian product — almost certainly wrong.
  if (pairs.length > 1) {
    throw new InvalidRequestError(
      `Only one pairExpand dimension is supported per query. Found: ${pairs.map((d) => d.alias ?? d.sql).join(", ")}`,
    );
  }
  return pairs[0];
}

function determineTimeGranularity(
  fromTimestamp: string,
  toTimestamp: string,
): z.infer<typeof granularities> {
  const from = new Date(fromTimestamp);
  const to = new Date(toTimestamp);
  const diffMs = to.getTime() - from.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // Choose appropriate granularity based on date range to get ~50 buckets
  if (diffHours < 2) {
    return "minute"; // Less than a 2h, use minutes
  }
  if (diffHours < 72) {
    return "hour"; // Less than 3 days, use hours
  }
  if (diffHours < 1440) {
    return "day"; // Less than 60 days, use days
  }
  if (diffHours < 8760) {
    return "week"; // Less than a year, use weeks
  }

  return "month"; // Over a year, use months
}

/**
 * The range WITH FILL adds empty time buckets over: from `fromTimestamp`
 * to `toTimestamp`, one bucket per `granularity`.
 *
 * Undefined, so the query gets no WITH FILL, when:
 * - the query has no time dimension;
 * - the caller sets `orderBy`, which replaces the time-bucket order the
 *   fill steps along;
 * - a bound is outside the 32-bit DateTime range the buckets use
 *   (`fromTimestamp` before 1970, `toTimestamp` after 2106-01-01), or
 *   the range spans more than 50,000 buckets.
 */
export function withFillRange(
  appliedBucketingDimension: AppliedBucketingDimension,
  fromTimestamp: string,
  toTimestamp: string,
  orderBy: Array<{ field: string; direction: string }> | null,
):
  | {
      fromDate: Date;
      toDate: Date;
      granularity: z.infer<typeof granularities>;
    }
  | undefined {
  if (appliedBucketingDimension.type !== "time") return undefined;
  if (orderBy && orderBy.length > 0) return undefined;

  const fromDate = new Date(fromTimestamp);
  const toDate = new Date(toTimestamp);
  const { granularity } = appliedBucketingDimension;
  const { approxMs: stepMs } =
    granularity === "auto" ? WITH_FILL_STEPS.day : WITH_FILL_STEPS[granularity];

  // Fill bounds are bucketed to 32-bit DateTime; if a step overflows it, the fill never ends.
  if (
    fromDate.getTime() < 0 ||
    toDate.getTime() > MAX_WITH_FILL_TO_MS ||
    (toDate.getTime() - fromDate.getTime()) / stepMs > MAX_WITH_FILL_BUCKETS
  ) {
    return undefined;
  }
  return { fromDate, toDate, granularity };
}

/**
 * Validates that the provided orderBy fields exist in the dimensions or metrics
 * and returns the processed orderBy array with fully qualified field names.
 */
export function validateAndProcessOrderBy(
  orderBy: Array<{ field: string; direction: string }> | null,
  appliedDimensions: AppliedDimensionType[],
  appliedMetrics: AppliedMetricType[],
  appliedBucketingDimension: AppliedBucketingDimension,
): Array<{ field: string; direction: string }> {
  if (!orderBy || orderBy.length === 0) {
    // Default order: time dimension if available, otherwise first metric, otherwise first dimension
    if (appliedBucketingDimension.type === "time") {
      return [
        {
          field: appliedBucketingDimension.bucketDimensionAlias,
          direction: "asc",
        },
      ];
    } else if (appliedMetrics.length > 0) {
      const firstMetric = appliedMetrics[0];
      return [
        {
          field: `${firstMetric.aggregation}_${firstMetric.alias || firstMetric.sql}`,
          direction: "desc",
        },
      ];
    } else if (appliedBucketingDimension.type !== "none") {
      return [
        {
          field: appliedBucketingDimension.bucketDimensionAlias,
          direction: "asc",
        },
      ];
    } else if (appliedDimensions.length > 0) {
      const firstDimension = appliedDimensions[0];
      return [
        {
          field: firstDimension.alias || firstDimension.sql,
          direction: "asc",
        },
      ];
    }
    return [];
  }

  // Validate that each orderBy field exists in dimensions or metrics
  return orderBy.map((item) => {
    if (
      appliedBucketingDimension.type !== "none" &&
      item.field === appliedBucketingDimension.bucketDimensionAlias
    ) {
      return item;
    }

    // Check if the field is a dimension
    const matchingDimension = appliedDimensions.find(
      (dim) => dim.alias === item.field || dim.sql === item.field,
    );
    if (matchingDimension) {
      return {
        field: matchingDimension.alias || matchingDimension.sql,
        direction: item.direction,
      };
    }

    // Check if the field is a metric (with aggregation prefix)
    const metricNamePattern =
      /^(sum|avg|count|max|min|p50|p75|p90|p95|p99|uniq)_(.+)$/;
    const metricMatch = item.field.match(metricNamePattern);

    if (metricMatch) {
      const [, aggregation, measureName] = metricMatch;
      const matchingMetric = appliedMetrics.find(
        (metric) =>
          (metric.alias === measureName || metric.sql === measureName) &&
          metric.aggregation === aggregation,
      );

      if (matchingMetric) {
        return item;
      }
    }

    throw new InvalidRequestError(
      `Invalid orderBy field: ${item.field}. Must be one of the dimension or metric fields.`,
    );
  });
}

/** `group by` / `order by` / `with fill` / `limit` of the outermost select. */
export function astOuterClauses(
  query: QueryType,
  appliedDimensions: AppliedDimensionType[],
  bucket: AppliedBucketingDimension,
  orderBy: Array<{ field: string; direction: string }>,
  rowLimit: number | undefined,
): OuterClauses {
  return {
    groupBy: [
      ...appliedDimensions.map((d) => aliasRef(dimensionAlias(d))),
      ...(bucket.type === "none"
        ? []
        : [aliasRef(bucket.bucketDimensionAlias)]),
    ],
    orderBy,
    fill: withFillRange(
      bucket,
      query.fromTimestamp,
      query.toTimestamp,
      query.orderBy,
    ),
    rowLimit,
  };
}

/**
 * The outer select of a two-level query over its inner select `inner`:
 * `select <dimensions>, <bucket>, <aggregation>(<measure>) … from (<inner>) as <alias>`.
 * A pair-expanded key stays bare (`costType`), every other dimension is
 * aliased (`name as name`); ClickHouse accepts either spelling.
 */
export function astOuterSelect<O, A extends string>(
  inner: AliasedSelectQueryBuilder<O, A>,
  appliedDimensions: AppliedDimensionType[],
  bucket: AppliedBucketingDimension,
  appliedMetrics: AppliedMetricType[],
  bins: number | undefined,
) {
  const db = getClickhouseKysely();
  return db
    .selectFrom(inner)
    .select((eb) => [
      ...appliedDimensions.map((d) =>
        d.pairExpand
          ? db.dynamic.ref(dimensionAlias(d))
          : aliasRef(dimensionAlias(d)).as(dimensionAlias(d)),
      ),
      ...(bucket.type === "none"
        ? []
        : [db.dynamic.ref(bucket.bucketDimensionAlias)]),
      ...astOuterMetrics(eb, appliedMetrics, bins),
    ]);
}

/**
 * `select` with `… group by <dimensions>, <bucket> order by … [with fill …]
 * [limit n]`, compiled for `projectId`.
 */
export function compileWithOuterClauses<DB, TB extends keyof DB, O>(
  projectId: string,
  { groupBy, orderBy, fill, rowLimit }: OuterClauses,
  select: SelectQueryBuilder<DB, TB, O>,
): { query: string; parameters: Record<string, unknown> } {
  let finished = groupBy.length > 0 ? select.groupBy(groupBy) : select;
  for (const item of orderBy) {
    finished = finished.orderBy(
      aliasRef(item.field),
      item.direction === "desc" ? "desc" : "asc",
    );
  }
  if (fill) {
    const { bucket: toBucket, step } = timeBucket(fill.granularity);
    finished = finished.$call(
      withFill({
        from: toBucket(utcDateTime(fill.fromDate)),
        to: toBucket(utcDateTime(fill.toDate)),
        step: step(),
      }),
    );
  }
  if (rowLimit) {
    finished = finished.limit(rowLimitLiteral(rowLimit));
  }
  const { sql: compiled, params } = compileClickhouseQuery(finished, projectId);
  return { query: compiled, parameters: params };
}

export function dimensionAlias(dimension: AppliedDimensionType): string {
  return dimension.alias ?? dimension.sql;
}

/**
 * The time or entity bucket as `time_dimension` / `entity_dimension`, from
 * the view's time column or its entity dimension; `any(…)` in the inner
 * select of a two-level query, or the view's `perEntityTime` there.
 */
export function astBucketSelection(
  bucket: AppliedBucketingDimension,
  level: QueryLevel,
  values: BucketValues,
) {
  if (bucket.type === "none") return [];
  if (bucket.type === "time" && level === "two" && values.perEntityTime) {
    return [
      values
        .perEntityTime(timeBucket(bucket.granularity).bucket)
        .as(bucket.bucketDimensionAlias),
    ];
  }
  const value =
    bucket.type === "time"
      ? timeBucket(bucket.granularity).bucket(values.time)
      : values.entity(bucket.field);
  return [atLevel(value, level).as(bucket.bucketDimensionAlias)];
}

/**
 * `<aggregation>(<measure>) as <aggregation>_<measure>`, or `count(*) as
 * count`; `value` is the view's single-level value of a measure.
 */
export function astSingleLevelMetrics<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  appliedMetrics: AppliedMetricType[],
  value: (metric: AppliedMetricType) => Expression<unknown>,
  bins: number | undefined,
) {
  if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
  return appliedMetrics.map((metric) =>
    astAggregate(eb, metric, value(metric), bins).as(
      `${metric.aggregation}_${metric.alias || metric.sql}`,
    ),
  );
}

/**
 * `<measure> as <measure>`, or `count(*) as count`; `value` is the view's
 * inner-select value of a measure.
 */
export function astInnerMetrics<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  appliedMetrics: AppliedMetricType[],
  value: (metric: AppliedMetricType) => AliasableExpression<unknown>,
) {
  if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
  return appliedMetrics.map((metric) =>
    value(metric).as(metric.alias || metric.sql),
  );
}

/** `<aggregation>(<inner alias>) as <aggregation>_<measure>`, or `count(*) as count`. */
function astOuterMetrics<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  appliedMetrics: AppliedMetricType[],
  bins: number | undefined,
) {
  if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
  return appliedMetrics.map((metric) =>
    astAggregate(eb, metric, aliasRef(metric.alias || metric.sql), bins).as(
      `${metric.aggregation}_${metric.alias || metric.sql}`,
    ),
  );
}

/**
 * `translateAggregation` (`sqlTextQuery.ts`) of `value`; a histogram has `bins`
 * bins (default 10).
 */
function astAggregate<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  metric: AppliedMetricType,
  value: Expression<unknown>,
  bins: number | undefined,
): AliasableExpression<unknown> {
  const aggregation = metric.queryAggregation ?? metric.aggregation;
  switch (aggregation) {
    case "sum":
      return eb.fn.sum(value);
    case "avg":
      return eb.fn.avg(value);
    case "count":
      return eb.fn.count(value);
    case "max":
      return eb.fn.max(value);
    case "min":
      return eb.fn.min(value);
    case "p50":
      return quantile(0.5, value);
    case "p75":
      return quantile(0.75, value);
    case "p90":
      return quantile(0.9, value);
    case "p95":
      return quantile(0.95, value);
    case "p99":
      return quantile(0.99, value);
    case "histogram":
      return histogram(bins ?? 10, toFloat64(value));
    case "uniq":
      return uniq(value);
    default:
      throw new InvalidRequestError(
        `Invalid aggregation: ${aggregation satisfies never}`,
      );
  }
}
