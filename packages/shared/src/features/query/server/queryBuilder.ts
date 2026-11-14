import { randomUUID } from "crypto";
import {
  expressionBuilder,
  type AliasableExpression,
  type Expression,
  type ExpressionBuilder,
  type SelectQueryBuilder,
} from "kysely";
import { type z } from "zod";
import {
  shouldSkipObservationsFinal,
  shouldSkipScoresDedup,
} from "../../../server/queries/clickhouse-sql/query-options";
import {
  bindUtcDateTimeParam,
  FilterList,
  filtersRequireEventsFull,
  type Filter,
} from "../../../server/queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../../../server/queries/clickhouse-sql/factory";
import {
  type QueryType,
  type ViewDeclarationType,
  type metricAggregations,
  type granularities,
  type ViewVersion,
  type views,
  query as queryModel,
  getValidAggregationsForMeasureType,
  SCORES_LISTABLE_COUNT_VIEW,
} from "../types";

import { eventsObservationsView, getViewDeclaration } from "../dataModel";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { env } from "../../../env";
import { conditionFromFilter } from "../../../query-ast/filterStateCodec";
import type { PredicateCondition } from "../../../query-ast/predicate";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { compileClickhouseQuery } from "../../../server/query-ast/compile";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  aliasRef,
  anyValue,
  arrayJoin,
  arrayJoinElements,
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
  useFinal,
  withFill,
  type IntervalUnit,
  type IntervalValue,
} from "../../../server/query-ast/extensions";
import { lowerEventsFieldCondition } from "../../../server/repositories/events-predicate";
import type { EventsFieldLowering } from "../../../server/repositories/events-predicate-fields";
import {
  eventsObservationsArrayDimension,
  eventsObservationsDimension,
  eventsObservationsFilterLowering,
  eventsObservationsMeasure,
  eventsObservationsScoresJoin,
  type ObservationsBuilder,
  type ObservationsDb,
  type QueryLevel,
} from "./eventsObservationsRegistry";
import { NULL_IF_EMPTY_RE } from "./nullIfEmptyFilter";
import {
  getCompatibleFilterTypes,
  isFilterColumnType,
  type CompatibleFilterType,
  type FilterColumnType,
} from "../../../server/queries/clickhouse-sql/filterTypeCompatibility";

type AppliedDimensionType = {
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

type AppliedMetricType = {
  sql: string;
  aggregation: z.infer<typeof metricAggregations>;
  queryAggregation?: z.infer<typeof metricAggregations>;
  alias?: string;
  relationTable?: string;
  aggs?: Record<string, string>;
  measureName: string; // Original measure name for lookups
  requiresDimension?: string;
};

type RawSqlPart = { query: string; params: Record<string, unknown> };

type MappedFilters = {
  whereFilters: Filter[];
  whereRawParts: RawSqlPart[];
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

type AppliedBucketingDimension =
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
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** WITH FILL step per granularity; approxMs never exceeds the real step, so bucket estimates err high. */
const WITH_FILL_STEPS: Record<
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
const utcDateTime = (date: Date) =>
  typedValue<Date>(
    convertDateToClickhouseDateTime(date),
    "DateTime64(3, 'UTC')",
  );

/** A time granularity after `auto` is resolved to one of the others. */
type Granularity = Exclude<z.infer<typeof granularities>, "auto">;

/** A dashboard filter as the events predicate lowering takes it. */
type DashboardFilter = {
  lowering: EventsFieldLowering;
  condition: PredicateCondition;
};

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
function assertKnownRelationTables(
  view: ViewDeclarationType,
  relationTables: Iterable<string>,
) {
  for (const relationTable of relationTables) {
    if (!(relationTable in view.tableRelations)) {
      throw new InvalidRequestError(
        `Invalid relationTable: ${relationTable}. Must be one of ${Object.keys(view.tableRelations)}`,
      );
    }
  }
}

/**
 * The clauses that follow FROM … WHERE on the outermost v2 observations
 * select (the only select at single level, the parent of `per_span` at two
 * levels): `group by … order by … [with fill …] [limit n]`.
 */
type OuterClauses = {
  groupBy: Expression<unknown>[];
  orderBy: Array<{ field: string; direction: string }>;
  fill:
    | { fromDate: Date; toDate: Date; granularity: Granularity | "auto" }
    | undefined;
  rowLimit: number | undefined;
};

/** Latest fill bound whose TO + one step stays below the DateTime maximum (2106-02-07T06:28:15Z). */
const MAX_WITH_FILL_TO_MS = Date.UTC(2106, 0, 1);
const MAX_WITH_FILL_BUCKETS = 50_000;

export class QueryBuilder {
  private chartConfig?: { bins?: number; row_limit?: number };
  private version: ViewVersion;
  private rootEventConditionMaxWindowHours: number =
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS;

  constructor(
    chartConfig?: { bins?: number; row_limit?: number },
    version: ViewVersion = "v1",
  ) {
    this.chartConfig = chartConfig;
    this.version = version;
  }

  setRootEventConditionMaxWindowHours(hours: number): void {
    this.rootEventConditionMaxWindowHours = hours;
  }

  private translateAggregation(metric: AppliedMetricType): string {
    const aggregation = metric.queryAggregation ?? metric.aggregation;

    switch (aggregation) {
      case "sum":
        return `sum(${metric.alias || metric.sql})`;
      case "avg":
        return `avg(${metric.alias || metric.sql})`;
      case "count":
        return `count(${metric.alias || metric.sql})`;
      case "max":
        return `max(${metric.alias || metric.sql})`;
      case "min":
        return `min(${metric.alias || metric.sql})`;
      case "p50":
        return `quantile(0.5)(${metric.alias || metric.sql})`;
      case "p75":
        return `quantile(0.75)(${metric.alias || metric.sql})`;
      case "p90":
        return `quantile(0.9)(${metric.alias || metric.sql})`;
      case "p95":
        return `quantile(0.95)(${metric.alias || metric.sql})`;
      case "p99":
        return `quantile(0.99)(${metric.alias || metric.sql})`;
      case "histogram": {
        // Get histogram bins from chart config, fallback to 10
        const bins = this.chartConfig?.bins ?? 10;
        return `histogram(${bins})(toFloat64(${metric.alias || metric.sql}))`;
      }
      case "uniq":
        return `uniq(${metric.alias || metric.sql})`;
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustiveCheck: never = aggregation;
        throw new InvalidRequestError(
          `Invalid aggregation: ${aggregation satisfies never}`,
        );
      }
    }
  }

  private getViewDeclaration(
    viewName: z.infer<typeof views> | typeof SCORES_LISTABLE_COUNT_VIEW,
  ): ViewDeclarationType {
    return getViewDeclaration(viewName, this.version);
  }

  private applyBucketingDimension(
    query: QueryType,
    view: ViewDeclarationType,
  ): AppliedBucketingDimension {
    if (query.timeDimension && query.entityDimension) {
      throw new InvalidRequestError(
        "timeDimension and entityDimension are mutually exclusive",
      );
    }

    if (query.timeDimension) {
      const granularity =
        query.timeDimension.granularity === "auto"
          ? this.determineTimeGranularity(
              query.fromTimestamp,
              query.toTimestamp,
            )
          : query.timeDimension.granularity;

      return {
        type: "time",
        bucketDimensionAlias: "time_dimension",
        granularity,
      };
    }

    if (query.entityDimension) {
      if (this.version !== "v2") {
        throw new InvalidRequestError(
          "entityDimension is only supported for v2 queries",
        );
      }

      const field = query.entityDimension.field;
      const dimension = this.getEntityDimensionDefinition(view, field);

      // Entity buckets reuse view dimensions for SQL/relation metadata, but they are
      // not regular dimensions. Only declared relations are allowed; do not infer
      // broader join paths or propagation behavior here.
      if (
        dimension.relationTable &&
        !(dimension.relationTable in view.tableRelations)
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

  private getEntityDimensionDefinition(
    view: ViewDeclarationType,
    field: string,
  ) {
    const dimension = view.dimensions[field];
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

  private mapDimensions(
    dimensions: Array<{ field: string }>,
    view: ViewDeclarationType,
  ): AppliedDimensionType[] {
    return dimensions.map((dimension) => {
      if (!(dimension.field in view.dimensions)) {
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

  private mapMetrics(
    metrics: Array<{
      measure: string;
      aggregation: z.infer<typeof metricAggregations>;
    }>,
    view: ViewDeclarationType,
  ): AppliedMetricType[] {
    return metrics.map((metric) => {
      if (!(metric.measure in view.measures)) {
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
  private withRequiredDimensions(
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

  private validateFilters(
    filters: z.infer<typeof queryModel>["filters"],
    view: ViewDeclarationType,
  ) {
    for (const filter of filters) {
      // Validate filters on dimension fields
      const dimension = this.resolveDimension(filter.column, view);

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

      // Special validation for metadata filters
      else if (filter.column === "metadata") {
        if (filter.type !== "stringObject") {
          throw new InvalidRequestError(
            `Invalid filter for field 'metadata': Metadata filters require type 'stringObject' with a 'key' property, not '${filter.type}'. ` +
              `Example: {"column": "metadata", "type": "stringObject", "key": "environment", "operator": "=", "value": "production"}`,
          );
        }

        // Validate stringObject has required key
        if (filter.type === "stringObject" && !("key" in filter)) {
          throw new InvalidRequestError(
            `Invalid filter for field 'metadata': stringObject type requires a 'key' property to specify which metadata field to filter on. ` +
              `Example: {"column": "metadata", "type": "stringObject", "key": "environment", "operator": "=", "value": "production"}`,
          );
        }

        // Validate stringObject value type
        if (
          filter.type === "stringObject" &&
          typeof filter.value !== "string"
        ) {
          throw new InvalidRequestError(
            // @ts-ignore
            `Invalid filter for field 'metadata': stringObject type requires a string value, not '${typeof filter.value}'.`,
          );
        }
      }
    }
  }

  private actualTableName(view: ViewDeclarationType): string {
    // Extract actual table name from baseCte (e.g., "events_core events_traces" -> "events_core")
    return view.baseCte.split(" ")[0];
  }

  private tableAlias(view: ViewDeclarationType): string {
    // Return the alias from baseCte if present, otherwise the table name.
    // e.g., "events_core events_traces" -> "events_traces"
    //       "traces FINAL"              -> "traces"  (FINAL is a modifier, not an alias)
    const parts = view.baseCte.split(/\s+/);
    const clickhouseModifiers = new Set(["FINAL", "SAMPLE", "PREWHERE"]);
    if (parts.length >= 2 && !clickhouseModifiers.has(parts[1].toUpperCase())) {
      return parts[1];
    }
    return parts[0];
  }

  /**
   * Resolves a filter column to a dimension, with fallback for *Name columns.
   */
  private resolveDimension(
    filterColumn: string,
    view: ViewDeclarationType,
  ): ViewDeclarationType["dimensions"][string] | undefined {
    if (filterColumn in view.dimensions) {
      return view.dimensions[filterColumn];
    }
    // Fallback: scoreName/traceName → "name" dimension (LFE-4838)
    if (filterColumn.endsWith("Name") && "name" in view.dimensions) {
      return view.dimensions["name"];
    }
    return undefined;
  }

  /**
   * Builds a WHERE condition for a filterSql dimension:
   *   (col1 OP X OR col2 OP X) AND dimensionSql OP X
   *
   * The OR'd part is pruning-friendly (helps ClickHouse skip blocks).
   * The exact part uses the dimension's row-level sql expression for correctness.
   * Both delegate to createFilterFromFilterState for full operator/type support.
   */
  private buildFilterSqlWhereCondition(params: {
    filter: z.infer<typeof queryModel>["filters"][number];
    whereCols: string[];
    dimensionSql: string;
    tableName: string;
  }): RawSqlPart {
    const { filter, whereCols, dimensionSql, tableName } = params;

    const syntheticMapping = (clickhouseSelect: string) => [
      {
        uiTableName: filter.column,
        uiTableId: filter.column,
        clickhouseTableName: tableName,
        clickhouseSelect,
        queryPrefix: "",
      },
    ];

    // Pruning: one filter per where column, OR'd together
    const pruneApplied = whereCols.map((col) => {
      const filters = createFilterFromFilterState(
        [filter],
        syntheticMapping(col),
      );
      return filters[0].apply();
    });
    const pruneQuery = `(${pruneApplied.map((p) => p.query).join(" OR ")})`;
    const pruneParams = pruneApplied.reduce<Record<string, unknown>>(
      (acc, p) => ({ ...acc, ...p.params }),
      {},
    );

    // Exact match: filter on the dimension's row-level sql expression
    const exactFilters = createFilterFromFilterState(
      [filter],
      syntheticMapping(dimensionSql),
    );
    const exactApplied = exactFilters[0].apply();

    return {
      query: `${pruneQuery} AND ${exactApplied.query}`,
      params: { ...pruneParams, ...exactApplied.params },
    };
  }

  private mapFilters(
    filters: z.infer<typeof queryModel>["filters"],
    view: ViewDeclarationType,
  ): MappedFilters {
    // Validate all filters before processing
    this.validateFilters(filters, view);

    const actualTableName = this.actualTableName(view);

    const result: MappedFilters = {
      whereFilters: [],
      whereRawParts: [],
    };

    // Separate filters into normal (createFilterFromFilterState) and filterSql-aware
    const normalFilters: z.infer<typeof queryModel>["filters"] = [];
    const normalMappings: Array<{
      uiTableName: string;
      uiTableId: string;
      clickhouseTableName: string;
      clickhouseSelect: string;
      queryPrefix: string;
      type: string;
      emptyEqualsNull?: boolean;
    }> = [];

    for (const filter of filters) {
      const dimension = this.resolveDimension(filter.column, view);

      // Dimension with filterSql: pruning OR + exact match, both in WHERE
      if (dimension?.filterSql) {
        result.whereRawParts.push(
          this.buildFilterSqlWhereCondition({
            filter,
            whereCols: dimension.filterSql.where,
            dimensionSql: dimension.sql,
            tableName: actualTableName,
          }),
        );
        continue;
      }

      // Normal dimension or special-case filter: build column mapping
      let clickhouseSelect: string;
      let queryPrefix = "";
      let clickhouseTableName: string = actualTableName;
      let type: string;
      let emptyEqualsNull: boolean | undefined;

      if (dimension) {
        // Dimension with nullIf(col, ''): use raw column with emptyEqualsNull
        // flag for index-friendly filtering while preserving '' ≡ NULL semantic.
        const nullIfMatch = NULL_IF_EMPTY_RE.exec(dimension.sql);
        if (nullIfMatch) {
          clickhouseSelect = nullIfMatch[1];
          emptyEqualsNull = true;
        } else {
          clickhouseSelect = dimension.sql;
        }
        type = dimension.type ?? "string";
        if (dimension.relationTable) {
          clickhouseTableName = dimension.relationTable;
        }
        // Filters on measures are underdefined and not allowed in the initial version
        // } else if (filter.column in view.measures) {
        //   const measure = view.measures[filter.column];
        //   clickhouseSelect = measure.sql;
        //   type = measure.type;
        //   if (measure.relationTable) {
        //     clickhouseTableName = measure.relationTable;
        //   }
      } else if (filter.column === view.timeDimension) {
        clickhouseSelect = view.timeDimension;
        queryPrefix = clickhouseTableName;
        type = "datetime";
      } else if (filter.column === "metadata") {
        clickhouseSelect = "metadata";
        queryPrefix = clickhouseTableName;
        type = "stringObject";
      } else if (filter.column.endsWith("Name")) {
        // Sometimes, the filter does not update correctly and sends us scoreName instead of name for scores, etc.
        // If this happens, none of the conditions above apply, and we use this fallback to avoid raising an error.
        // As this is hard to catch, we include this workaround. (LFE-4838).
        clickhouseSelect = "name";
        queryPrefix = clickhouseTableName;
        type = "string";
      } else {
        throw new InvalidRequestError(
          `Invalid filter column ${filter.column}. Must be one of ${Object.keys(view.dimensions)} or ${view.timeDimension}`,
        );
      }

      normalFilters.push(filter);
      normalMappings.push({
        uiTableName: filter.column,
        uiTableId: filter.column,
        clickhouseTableName,
        clickhouseSelect,
        queryPrefix,
        type,
        emptyEqualsNull,
      });
    }

    // Create filters for non-filterSql dimensions using existing infrastructure
    result.whereFilters = createFilterFromFilterState(
      normalFilters,
      normalMappings,
    );
    return result;
  }

  private addStandardFilters(
    filterList: FilterList,
    view: ViewDeclarationType,
    projectId: string,
    fromTimestamp: string,
    toTimestamp: string,
  ) {
    const actualTableName = this.actualTableName(view);

    // Create column mappings for standard filters
    const projectIdMapping = {
      uiTableName: "project_id",
      uiTableId: "project_id",
      clickhouseTableName: actualTableName,
      clickhouseSelect: "project_id",
      queryPrefix: actualTableName,
      type: "string",
    };

    const timeDimensionMapping = {
      uiTableName: view.timeDimension,
      uiTableId: view.timeDimension,
      clickhouseTableName: actualTableName,
      clickhouseSelect: view.timeDimension,
      queryPrefix: actualTableName,
      type: "datetime",
    };

    // Add project_id filter
    const projectIdFilter = createFilterFromFilterState(
      [
        {
          column: "project_id",
          operator: "=",
          value: projectId,
          type: "string",
        },
      ],
      [projectIdMapping],
    );

    // Add fromTimestamp filter
    const fromFilter = createFilterFromFilterState(
      [
        {
          column: view.timeDimension,
          operator: ">=",
          value: new Date(fromTimestamp),
          type: "datetime",
        },
      ],
      [timeDimensionMapping],
    );

    // Add toTimestamp filter
    const toFilter = createFilterFromFilterState(
      [
        {
          column: view.timeDimension,
          operator: "<=",
          value: new Date(toTimestamp),
          type: "datetime",
        },
      ],
      [timeDimensionMapping],
    );

    // Add all filters to the filter list
    filterList.push(...projectIdFilter, ...fromFilter, ...toFilter);

    // Add segment filters if any
    if (view.segments.length > 0) {
      // Create column mappings for segment filters
      const segmentsMappings = view.segments.map((segment) => ({
        uiTableName: segment.column,
        uiTableId: segment.column,
        clickhouseTableName: view.name,
        clickhouseSelect: segment.column,
        queryPrefix: view.name,
        type: segment.type,
      }));

      const segmentFilters = createFilterFromFilterState(
        view.segments,
        segmentsMappings,
      );
      filterList.push(...segmentFilters);
    }

    return filterList;
  }

  private collectRelationTables(
    view: ViewDeclarationType,
    appliedDimensions: AppliedDimensionType[],
    appliedMetrics: AppliedMetricType[],
    filters: FilterList,
    appliedBucketingDimension: AppliedBucketingDimension,
  ) {
    const relationTables = new Set<string>();
    const actualTableName = this.actualTableName(view);

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
    filters.forEach((filter) => {
      // Only add as relation table if it's not the base table
      if (
        filter.clickhouseTable !== view.name &&
        filter.clickhouseTable !== actualTableName
      ) {
        relationTables.add(filter.clickhouseTable);
      }
    });
    return relationTables;
  }

  private canUseSingleLevelQuery(
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

  private substituteAggTemplates(
    sql: string,
    aggs: Record<string, string>,
  ): string {
    let result = sql;
    // Replace each @@AGGN@@ placeholder with its corresponding value
    for (const [placeholder, replacement] of Object.entries(aggs)) {
      const marker = `@@${placeholder.toUpperCase()}@@`;
      result = result.replaceAll(marker, replacement);
    }
    return result;
  }

  private buildJoins(
    relationTables: Set<string>,
    view: ViewDeclarationType,
    filterList: FilterList,
    query: QueryType,
    skipObservationsFinal: boolean,
    skipScoresFinal: boolean,
  ) {
    assertKnownRelationTables(view, relationTables);
    const relationJoins = [];
    for (const relationTableName of relationTables) {
      const relation = view.tableRelations[relationTableName];
      // Conditionally add FINAL - skip for observations if flag is set, and respect per-relation useFinal
      const shouldUseFinal =
        (relation.useFinal ?? true) &&
        !(relation.name === "observations" && skipObservationsFinal) &&
        !(relation.name === "scores" && skipScoresFinal);
      const alias =
        relation.name !== relationTableName ? ` AS ${relationTableName}` : "";
      // Without FINAL, drop tombstone rows. Unmerged older live versions of a
      // deleted score still join; skip-dedup projects never rewrite scores.
      const deletedScoresPredicate =
        relation.name === "scores" && !shouldUseFinal
          ? ` AND ${relationTableName}.is_deleted = 0`
          : "";
      const joinStatement = `INNER JOIN ${relation.name}${alias}${shouldUseFinal ? " FINAL" : ""} ${relation.joinConditionSql}${deletedScoresPredicate}`;

      // Create time dimension mapping for the relation table
      const relationTimeDimensionMapping = {
        uiTableName: relation.timeDimension,
        uiTableId: relation.timeDimension,
        clickhouseTableName: relation.name,
        clickhouseSelect: relation.timeDimension,
        queryPrefix: relationTableName,
        type: "datetime",
      };

      // Add relation-specific timestamp filters
      const fromFilter = createFilterFromFilterState(
        [
          {
            column: relation.timeDimension,
            operator: ">=",
            value: new Date(query.fromTimestamp),
            type: "datetime",
          },
        ],
        [relationTimeDimensionMapping],
      );

      const toFilter = createFilterFromFilterState(
        [
          {
            column: relation.timeDimension,
            operator: "<=",
            value: new Date(query.toTimestamp),
            type: "datetime",
          },
        ],
        [relationTimeDimensionMapping],
      );

      // Add filters to the filter list
      filterList.push(...fromFilter, ...toFilter);

      relationJoins.push(joinStatement);
    }
    return relationJoins;
  }

  /** The query's one pairExpand dimension, if any. */
  private pairExpandDimension(
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

  private buildArrayJoinClause(
    appliedDimensions: AppliedDimensionType[],
  ): string {
    const d = this.pairExpandDimension(appliedDimensions);
    if (!d) return "";
    return `ARRAY JOIN\n  ${d.sql} AS ${d.alias ?? d.sql},\n  ${d.pairExpand!.valuesSql} AS ${d.pairExpand!.valueAlias}`;
  }

  /**
   * ARRAY JOIN already binds the pairExpand key (`mapKeys(...) AS costType`).
   * Selecting `costType AS costType` in the same query makes ClickHouse throw
   * "Duplicate alias in ARRAY JOIN".
   */
  private pairExpandKeyColumn(dimension: AppliedDimensionType): string {
    return dimension.alias ?? dimension.sql;
  }

  private buildWhereClause(
    filterList: FilterList,
    parameters: Record<string, unknown>,
  ) {
    if (filterList.length() === 0) return "";

    // Use the FilterList's apply method to get the query and parameters
    const { query, params } = filterList.apply();

    // Add all parameters to the main parameters object
    Object.assign(parameters, params);

    // Return the WHERE clause with the query
    return ` WHERE ${query}`;
  }

  private determineTimeGranularity(
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

  private getTimeDimensionSql(
    sql: string,
    granularity: z.infer<typeof granularities>,
  ): string {
    switch (granularity) {
      case "minute":
        return `toStartOfMinute(${sql})`;
      case "hour":
        return `toStartOfHour(${sql})`;
      case "day":
        return `toDate(${sql})`;
      case "week":
        return `toMonday(${sql})`;
      case "month":
        return `toStartOfMonth(${sql})`;
      case "5m":
        return `toStartOfInterval(${sql}, INTERVAL 5 MINUTE)`;
      case "10m":
        return `toStartOfInterval(${sql}, INTERVAL 10 MINUTE)`;
      case "15m":
        return `toStartOfInterval(${sql}, INTERVAL 15 MINUTE)`;
      case "30m":
        return `toStartOfInterval(${sql}, INTERVAL 30 MINUTE)`;
      case "1h":
        return `toStartOfInterval(${sql}, INTERVAL 1 HOUR)`;
      case "2h":
        return `toStartOfInterval(${sql}, INTERVAL 2 HOUR)`;
      case "4h":
        return `toStartOfInterval(${sql}, INTERVAL 4 HOUR)`;
      case "1d":
        return `toStartOfInterval(${sql}, INTERVAL 1 DAY)`;
      case "2d":
        return `toStartOfInterval(${sql}, INTERVAL 2 DAY)`;
      case "1w":
        return `toStartOfInterval(${sql}, INTERVAL 7 DAY)`;
      case "auto":
        throw new Error(
          `Granularity 'auto' is not supported for getTimeDimensionSql`,
        );
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustiveCheck: never = granularity;
        throw new InvalidRequestError(
          `Invalid time granularity: ${granularity}. Must be one of minute, hour, day, week, month`,
        );
      }
    }
  }

  private buildTimeDimensionSql(
    view: ViewDeclarationType,
    appliedBucketingDimension: Extract<
      AppliedBucketingDimension,
      { type: "time" }
    >,
    wrapInAgg?: string,
  ): string {
    const actualTableName = this.actualTableName(view);
    const timeDimensionSql = this.getTimeDimensionSql(
      `${actualTableName}.${view.timeDimension}`,
      appliedBucketingDimension.granularity,
    );

    // Optionally wrap in aggregation function (e.g., "any" for two-level inner SELECT).
    // When the view has a rootEventCondition, prefer the root event's timestamp for
    // time bucketing. Falls back to min(start_time) when no semantic-root event
    // exists for a trace.
    let wrappedSql: string;
    if (wrapInAgg && view.rootEventCondition) {
      // The condition owns its qualification because prefixing a compound SQL
      // expression here would produce invalid SQL such as `alias.(a OR b)`.
      wrappedSql = `ifNull(anyIf(toNullable(${timeDimensionSql}), ${view.rootEventCondition.condition}), min(${timeDimensionSql}))`;
    } else if (wrapInAgg) {
      wrappedSql = `${wrapInAgg}(${timeDimensionSql})`;
    } else {
      wrappedSql = timeDimensionSql;
    }

    return `${wrappedSql} as time_dimension`;
  }

  private buildBucketDimensionSql(
    view: ViewDeclarationType,
    appliedBucketingDimension: AppliedBucketingDimension,
    wrapInAgg?: string,
  ): string {
    switch (appliedBucketingDimension.type) {
      case "none":
        return "";
      case "time":
        return this.buildTimeDimensionSql(
          view,
          appliedBucketingDimension,
          wrapInAgg,
        );
      case "entity": {
        const sql = wrapInAgg
          ? `${wrapInAgg}(${appliedBucketingDimension.dimension.sql})`
          : appliedBucketingDimension.dimension.sql;
        return `${sql} as ${appliedBucketingDimension.bucketDimensionAlias}`;
      }
      default: {
        const exhaustiveCheck: never = appliedBucketingDimension;
        return exhaustiveCheck;
      }
    }
  }

  private buildInnerDimensionsPart(
    appliedDimensions: AppliedDimensionType[],
    view: ViewDeclarationType,
    appliedBucketingDimension: AppliedBucketingDimension,
  ) {
    let dimensions = "";

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions += `${appliedDimensions
        .map((dimension) => {
          // Use custom aggregation function if specified (e.g., argMaxIf for events table traces)
          if (dimension.aggregationFunction) {
            return `${dimension.aggregationFunction} as ${dimension.alias ?? dimension.sql}`;
          }
          // pairExpand key columns (e.g. costType) are added to the inner GROUP BY in
          // buildInnerSelect, so they are already deterministic grouping keys here.
          // Unlike regular dimensions (which are not in GROUP BY and need any() to satisfy
          // ClickHouse's aggregation rules), wrapping in any() would be wrong: it implies
          // the value is non-deterministic within the group when it's actually the axis
          // being grouped on. Use a bare reference instead.
          // Note: the paired value column (e.g. cost_value) is NOT in GROUP BY and IS
          // wrapped in any() in buildInnerMetricsPart, so the outer query can re-aggregate it.
          if (dimension.pairExpand) {
            return this.pairExpandKeyColumn(dimension);
          }
          // Explode array dimensions using arrayJoin
          if (dimension.explodeArray) {
            return `arrayJoin(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`;
          }
          // Default: wrap in any()
          return `any(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`;
        })
        .join(",\n")},`;
    }

    // Add the bucket dimension if specified - use any() for two-level inner SELECTs.
    const bucketDimensionSql = this.buildBucketDimensionSql(
      view,
      appliedBucketingDimension,
      "any",
    );
    if (bucketDimensionSql) {
      dimensions += `${bucketDimensionSql},`;
    }

    return dimensions;
  }

  private buildInnerMetricsPart(appliedMetrics: AppliedMetricType[]) {
    if (appliedMetrics.length === 0) {
      return "count(*) as count";
    }

    return appliedMetrics
      .map((metric) => {
        let sql = metric.sql;

        // For two-level queries, substitute @@AGGN@@ with actual agg function from template
        if (metric.aggs) {
          sql = this.substituteAggTemplates(sql, metric.aggs);
        }

        // pairExpand value-alias measures (e.g. costByType, usageByType) reference a raw
        // column brought into scope by the ARRAY JOIN clause. That column is not in the
        // inner GROUP BY, so wrap it in any() to satisfy ClickHouse. The outer query then
        // applies the real aggregation. We scope this to requiresDimension metrics only —
        // other measures use @@AGGN@@ templates that resolve to function calls, so they
        // never need this treatment.
        if (metric.requiresDimension && !sql.includes("(")) {
          sql = `any(${sql})`;
        }

        return `${sql} as ${metric.alias || metric.sql}`;
      })
      .join(",\n");
  }

  private buildInnerSelect(
    view: ViewDeclarationType,
    innerDimensionsPart: string,
    innerMetricsPart: string,
    fromClause: string,
    appliedDimensions: AppliedDimensionType[],
  ) {
    const actualTableName = this.actualTableName(view);
    // Use actual SQL from view definition for id column (handles events.span_id -> id mapping)
    const idSql = view.dimensions.id?.sql || `${actualTableName}.id`;
    const projectIdSql = `${actualTableName}.project_id`;

    // Build inner GROUP BY - include exploded array dimensions (they must be in GROUP BY after arrayJoin)
    // Also include pairExpand dimensions (their key column is in scope after ARRAY JOIN clause)
    const groupByParts = [projectIdSql, idSql];
    for (const dim of appliedDimensions) {
      if (dim.explodeArray || dim.pairExpand) {
        groupByParts.push(dim.alias ?? dim.sql);
      }
    }

    return `
      SELECT
        ${projectIdSql},
        ${idSql},
        ${innerDimensionsPart}
        ${innerMetricsPart}
        ${fromClause}
      GROUP BY ${groupByParts.join(", ")}`;
  }

  private buildOuterDimensionsPart(
    appliedDimensions: AppliedDimensionType[],
    appliedBucketingDimension: AppliedBucketingDimension,
  ) {
    let dimensions = "";

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions += `${appliedDimensions
        .map((dimension) =>
          dimension.pairExpand
            ? this.pairExpandKeyColumn(dimension)
            : `${dimension.alias ?? dimension.sql} as ${dimension.alias || dimension.sql}`,
        )
        .join(",\n")},`;
    }

    if (appliedBucketingDimension.type !== "none") {
      dimensions += `${appliedBucketingDimension.bucketDimensionAlias},`;
    }

    return dimensions;
  }

  private buildOuterMetricsPart(appliedMetrics: AppliedMetricType[]) {
    return appliedMetrics.length > 0
      ? `${appliedMetrics.map((metric) => `${this.translateAggregation(metric)} as ${metric.aggregation}_${metric.alias || metric.sql}`).join(",\n")}`
      : "count(*) as count";
  }

  private buildGroupByClause(
    appliedDimensions: AppliedDimensionType[],
    appliedBucketingDimension: AppliedBucketingDimension,
  ) {
    const dimensions = [];

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions.push(
        ...appliedDimensions.map(
          (dimension) => dimension.alias ?? dimension.sql,
        ),
      );
    }

    if (appliedBucketingDimension.type !== "none") {
      dimensions.push(appliedBucketingDimension.bucketDimensionAlias);
    }

    return dimensions.length > 0 ? `GROUP BY ${dimensions.join(",\n")}` : "";
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
  private withFillRange(
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
      granularity === "auto"
        ? WITH_FILL_STEPS.day
        : WITH_FILL_STEPS[granularity];

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
   * Builds a WITH FILL clause for time dimension to ensure continuous time series data.
   * This fills in gaps in the time series with zero values based on the granularity.
   * Only applied if timeDimension is used and no ORDER BY is specified.
   */
  private buildWithFillClause(
    appliedBucketingDimension: AppliedBucketingDimension,
    fromTimestamp: string,
    toTimestamp: string,
    orderBy: Array<{ field: string; direction: string }> | null,
    parameters: Record<string, unknown>,
  ): string {
    const fill = this.withFillRange(
      appliedBucketingDimension,
      fromTimestamp,
      toTimestamp,
      orderBy,
    );
    if (!fill) return "";
    const { fromDate, toDate, granularity } = fill;
    const { sql: step } =
      granularity === "auto"
        ? WITH_FILL_STEPS.day
        : WITH_FILL_STEPS[granularity];

    const fillFromDateParam = bindUtcDateTimeParam("fillFromDate", fromDate);
    const fillToDateParam = bindUtcDateTimeParam("fillToDate", toDate);
    parameters["fillFromDate"] = fillFromDateParam.value;
    parameters["fillToDate"] = fillToDateParam.value;

    return ` WITH FILL FROM ${this.getTimeDimensionSql(fillFromDateParam.placeholder, granularity)} TO ${this.getTimeDimensionSql(fillToDateParam.placeholder, granularity)} STEP ${step}`;
  }

  /**
   * Builds a LIMIT clause for the query if row_limit is specified in chartConfig.
   */
  private buildLimitClause(): string {
    const rowLimit = this.chartConfig?.row_limit;
    if (!rowLimit) return "";
    return `LIMIT ${rowLimit}`;
  }

  private buildOuterSelect(
    outerDimensionsPart: string,
    outerMetricsPart: string,
    innerQuery: string,
    groupByClause: string,
    orderByClause: string,
    withFillClause: string,
    limitClause: string,
  ) {
    return `
      SELECT
        ${outerDimensionsPart}
        ${outerMetricsPart}
      FROM (${innerQuery})
      ${groupByClause}
      ${orderByClause}
      ${withFillClause}
      ${limitClause}`;
  }

  private buildSingleLevelMetricsPart(
    appliedMetrics: AppliedMetricType[],
  ): string {
    if (appliedMetrics.length === 0) {
      return "count(*) as count";
    }

    return appliedMetrics
      .map((m) => {
        // For single-level: REMOVE @@AGGN@@ markers (strip template aggregations)
        let baseSql = m.sql;
        if (m.aggs) {
          for (const placeholder of Object.keys(m.aggs)) {
            const marker = `@@${placeholder.toUpperCase()}@@`;
            baseSql = baseSql.replaceAll(marker, "");
          }
        }
        // Apply user-requested aggregation to the stripped SQL
        // Important: Clear alias so translateAggregation uses the sql directly
        const aggregatedSql = this.translateAggregation({
          ...m,
          sql: baseSql,
          alias: undefined, // Force use of sql instead of alias
        });
        return `${aggregatedSql} as ${m.aggregation}_${m.alias || m.sql}`;
      })
      .join(",\n");
  }

  private buildSingleLevelDimensionsPart(
    appliedDimensions: AppliedDimensionType[],
    view: ViewDeclarationType,
    appliedBucketingDimension: AppliedBucketingDimension,
  ): string {
    let dimensionsPart = "";
    if (appliedDimensions.length > 0) {
      dimensionsPart =
        appliedDimensions
          .map((d) => {
            if (d.pairExpand) {
              return this.pairExpandKeyColumn(d);
            }
            if (d.explodeArray) {
              return `arrayJoin(${d.sql}) as ${d.alias ?? d.sql}`;
            }
            return `${d.sql} as ${d.alias ?? d.sql}`;
          })
          .join(",\n") + ",\n";
    }

    // Reuse unified bucket dimension builder (no wrapper for single-level).
    const bucketDimensionSql = this.buildBucketDimensionSql(
      view,
      appliedBucketingDimension,
    );
    if (bucketDimensionSql) {
      dimensionsPart += `${bucketDimensionSql},\n`;
    }

    return dimensionsPart;
  }

  private buildSingleLevelSelect(
    view: ViewDeclarationType,
    appliedDimensions: AppliedDimensionType[],
    appliedMetrics: AppliedMetricType[],
    appliedBucketingDimension: AppliedBucketingDimension,
    fromClause: string,
    groupByClause: string,
    orderByClause: string,
    withFillClause: string,
    limitClause: string,
  ): string {
    // Build dimensions using dedicated helper
    const dimensionsPart = this.buildSingleLevelDimensionsPart(
      appliedDimensions,
      view,
      appliedBucketingDimension,
    );

    // Build optimized metrics (strip templates, apply user aggregation)
    const metricsPart = this.buildSingleLevelMetricsPart(appliedMetrics);

    return `
      SELECT
        ${dimensionsPart}${metricsPart}
      ${fromClause}
      ${groupByClause}
      ${orderByClause}
      ${withFillClause}
      ${limitClause}`;
  }

  /**
   * Validates that the provided orderBy fields exist in the dimensions or metrics
   * and returns the processed orderBy array with fully qualified field names.
   */
  private validateAndProcessOrderBy(
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

  /**
   * Builds the ORDER BY clause for the query.
   */
  private buildOrderByClause(
    processedOrderBy: Array<{ field: string; direction: string }>,
  ): string {
    if (processedOrderBy.length === 0) {
      return "";
    }

    return `ORDER BY ${processedOrderBy
      .map((item) => `${item.field} ${item.direction}`)
      .join(", ")}`;
  }

  /**
   * {@link build} for the v2 observations view, on the query AST: the same
   * single- and two-level shapes, with the view's entries from
   * `eventsObservationsRegistry.ts` and its filters lowered by the events
   * predicate lowering. Reads `events_truncated`, so it selects the
   * `events_core` values as the string builder does; a filter that needs
   * untruncated values routes it to `events_full`, where the routing pass
   * cuts the selected truncated columns. Tenancy adds the project
   * conditions. Rows flagged deleted are read, as the string builder does.
   */
  private buildEventsObservations(
    query: QueryType,
    projectId: string,
    enableSingleLevelOptimization: boolean,
    skipScoresFinal: boolean,
  ): { query: string; parameters: Record<string, unknown> } {
    const view = eventsObservationsView;
    const requestedDimensions = this.mapDimensions(query.dimensions, view);
    const appliedMetrics = this.mapMetrics(query.metrics, view);
    const bucket = this.applyBucketingDimension(query, view);
    const appliedDimensions = this.withRequiredDimensions(
      requestedDimensions,
      appliedMetrics,
      view,
    );
    this.validateFilters(query.filters, view);
    const filters = query.filters.map(
      (filter): DashboardFilter => ({
        lowering: eventsObservationsFilterLowering(filter.column),
        condition: conditionFromFilter(filter),
      }),
    );

    // No filter joins a relation: `eventsObservationsFilterLowering` compares
    // `e` columns only. The empty list stands in for the filters.
    const relationTables = this.collectRelationTables(
      view,
      appliedDimensions,
      appliedMetrics,
      new FilterList([]),
      bucket,
    );
    assertKnownRelationTables(view, relationTables);
    const pairDimension = this.pairExpandDimension(appliedDimensions);
    const level: QueryLevel =
      enableSingleLevelOptimization &&
      this.canUseSingleLevelQuery(appliedDimensions, appliedMetrics)
        ? "single"
        : "two";
    const orderBy = this.validateAndProcessOrderBy(
      query.orderBy,
      appliedDimensions,
      appliedMetrics,
      bucket,
    );
    const fill = this.withFillRange(
      bucket,
      query.fromTimestamp,
      query.toTimestamp,
      query.orderBy,
    );
    const db = getClickhouseKysely();
    const source = this.astEventsSource(
      query,
      filters,
      relationTables.has("scores"),
      skipScoresFinal,
      pairDimension,
    );

    const outerClauses: OuterClauses = {
      groupBy: [
        ...appliedDimensions.map((d) => aliasRef(this.dimensionAlias(d))),
        ...(bucket.type === "none"
          ? []
          : [aliasRef(bucket.bucketDimensionAlias)]),
      ],
      orderBy,
      fill,
      rowLimit: this.chartConfig?.row_limit,
    };

    if (level === "single") {
      // select <dimensions>, <bucket>, <aggregation>(<measure>) … from <source>
      return this.compileWithOuterClauses(
        projectId,
        outerClauses,
        source.select((eb) => [
          ...appliedDimensions.map((d) =>
            this.astDimensionSelection(eb, d, "single"),
          ),
          ...this.astBucketSelection(eb, bucket, "single"),
          ...this.astSingleLevelMetrics(eb, appliedMetrics),
        ]),
      );
    }
    // select e.project_id, e.span_id, <dimensions>, <bucket>, <measures> from <source>
    // group by e.project_id, e.span_id[, <exploded and pair-expanded aliases>]
    const perSpan = source
      .select(["e.project_id", "e.span_id"])
      .select((eb) => [
        ...appliedDimensions.map((d) =>
          this.astDimensionSelection(eb, d, "two"),
        ),
        ...this.astBucketSelection(eb, bucket, "two"),
        ...this.astInnerMetrics(eb, appliedMetrics),
      ])
      .groupBy([
        "e.project_id",
        "e.span_id",
        ...appliedDimensions
          .filter((d) => d.explodeArray || d.pairExpand)
          .map((d) => aliasRef(this.dimensionAlias(d))),
      ]);
    // select <dimensions>, <bucket>, <aggregation>(<measure>) … from (<perSpan>) as per_span
    return this.compileWithOuterClauses(
      projectId,
      outerClauses,
      db.selectFrom(perSpan.as("per_span")).select((eb) => [
        // A bare pair-expanded key (`costType`), every other dimension
        // aliased (`name as name`); ClickHouse accepts either spelling.
        ...appliedDimensions.map((d) =>
          d.pairExpand
            ? db.dynamic.ref(this.dimensionAlias(d))
            : aliasRef(this.dimensionAlias(d)).as(this.dimensionAlias(d)),
        ),
        ...(bucket.type === "none"
          ? []
          : [db.dynamic.ref(bucket.bucketDimensionAlias)]),
        ...this.astOuterMetrics(eb, appliedMetrics),
      ]),
    );
  }

  /**
   * `select` with `… group by <dimensions>, <bucket> order by … [with fill …]
   * [limit n]`, compiled for `projectId`.
   */
  private compileWithOuterClauses<DB, TB extends keyof DB, O>(
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
    const { sql: compiled, params } = compileClickhouseQuery(
      finished,
      projectId,
    );
    return { query: compiled, parameters: params };
  }

  /**
   * The FROM, JOINs, ARRAY JOIN and WHERE of the v2 observations query:
   * `from events_truncated as e [inner join scores [final] on …] [array join …] where
   * <filters> and e.start_time between <from> and <to> [and scores.timestamp
   * between <from> and <to>]`.
   */
  private astEventsSource(
    query: QueryType,
    filters: DashboardFilter[],
    joinsScores: boolean,
    skipScoresFinal: boolean,
    pairDimension: AppliedDimensionType | undefined,
  ) {
    const from = utcDateTime(new Date(query.fromTimestamp));
    const to = utcDateTime(new Date(query.toTimestamp));
    const db = getClickhouseKysely();
    // from events_truncated as e where <filters> and e.start_time between <from> and <to>
    let events = db.selectFrom("events_truncated as e");
    const eventsEb = expressionBuilder(events);
    for (const { lowering, condition } of filters) {
      for (const conjunct of lowerEventsFieldCondition(
        eventsEb,
        lowering,
        condition,
      )) {
        events = events.where(conjunct);
      }
    }
    events = events
      .where("e.start_time", ">=", from)
      .where("e.start_time", "<=", to);

    // … inner join scores [final] on <join> … and scores.timestamp between <from> and <to>
    // The builder stays typed over `e` alone; the one measure that reads
    // `scores` builds it from a builder typed with the join
    // (`astMeasureValue`).
    const joined = events.$if(joinsScores, (qb) => {
      const withScores = qb
        .innerJoin("scores", (join) =>
          join.on((eb) =>
            eventsObservationsScoresJoin(eb, {
              liveScoresOnly: skipScoresFinal,
            }),
          ),
        )
        .where("scores.timestamp", ">=", from)
        .where("scores.timestamp", "<=", to);
      return skipScoresFinal
        ? withScores
        : withScores.$call(useFinal(["scores"]));
    });

    if (!pairDimension) return joined;
    // … array join <keys> as <alias>, <values> as <valueAlias> …
    const { expression, pairExpand } = eventsObservationsArrayDimension(
      pairDimension.name,
      "pairExpand",
    );
    return joined.$call(
      arrayJoin((eb) => ({
        [this.dimensionAlias(pairDimension)]: expression(eb),
        [pairExpand.valueAlias]: pairExpand.values(eb),
      })),
    );
  }

  private dimensionAlias(dimension: AppliedDimensionType): string {
    return dimension.alias ?? dimension.sql;
  }

  /**
   * A dimension of the single-level select or the inner select of a
   * two-level one. Grouping keys of that select are bare: the ARRAY JOIN
   * alias of a pairExpand dimension, the `arrayJoin(…)` of an exploded one.
   * Other dimensions are `any(…)` in the inner select, whose rows are one per
   * observation.
   */
  private astDimensionSelection(
    eb: ObservationsBuilder,
    dimension: AppliedDimensionType,
    level: QueryLevel,
  ) {
    const alias = this.dimensionAlias(dimension);
    if (dimension.pairExpand) return getClickhouseKysely().dynamic.ref(alias);
    if (dimension.explodeArray) {
      const { expression } = eventsObservationsArrayDimension(
        dimension.name,
        "explode",
      );
      return arrayJoinElements(expression(eb)).as(alias);
    }
    const value = eventsObservationsDimension(dimension.name).expression(eb);
    return (level === "two" ? anyValue(value) : value).as(alias);
  }

  /** The time or entity bucket as `time_dimension` / `entity_dimension`. */
  private astBucketSelection(
    eb: ObservationsBuilder,
    bucket: AppliedBucketingDimension,
    level: QueryLevel,
  ) {
    if (bucket.type === "none") return [];
    const value =
      bucket.type === "time"
        ? timeBucket(bucket.granularity).bucket(eb.ref("e.start_time"))
        : eventsObservationsDimension(bucket.field).expression(eb);
    return [
      (level === "two" ? anyValue(value) : value).as(
        bucket.bucketDimensionAlias,
      ),
    ];
  }

  /**
   * A measure's value at `level`. A measure that reads a dimension's ARRAY
   * JOIN alias is `any(…)` in the inner select, which groups by observation
   * and not by that alias; the outer select aggregates it.
   */
  private astMeasureValue(
    eb: ObservationsBuilder,
    metric: AppliedMetricType,
    level: QueryLevel,
  ): AliasableExpression<unknown> {
    const entry = eventsObservationsMeasure(metric.measureName);
    if ("aggs" in entry) return entry.expression(eb, level);
    if ("relationTable" in entry) {
      // Typed with the scores join, which the query adds for this measure.
      return entry.expression(
        expressionBuilder<ObservationsDb, "e" | "scores">(),
      );
    }
    const value = entry.expression(eb);
    return level === "two" ? anyValue(value) : value;
  }

  /** `<aggregation>(<measure>) as <aggregation>_<measure>`, or `count(*) as count`. */
  private astSingleLevelMetrics(
    eb: ObservationsBuilder,
    appliedMetrics: AppliedMetricType[],
  ) {
    if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
    return appliedMetrics.map((metric) =>
      this.astAggregate(
        eb,
        metric,
        this.astMeasureValue(eb, metric, "single"),
      ).as(`${metric.aggregation}_${metric.alias || metric.sql}`),
    );
  }

  /** `<measure> as <measure>`, or `count(*) as count`. */
  private astInnerMetrics(
    eb: ObservationsBuilder,
    appliedMetrics: AppliedMetricType[],
  ) {
    if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
    return appliedMetrics.map((metric) =>
      this.astMeasureValue(eb, metric, "two").as(metric.alias || metric.sql),
    );
  }

  /** `<aggregation>(<inner alias>) as <aggregation>_<measure>`, or `count(*) as count`. */
  private astOuterMetrics<DB, TB extends keyof DB>(
    eb: ExpressionBuilder<DB, TB>,
    appliedMetrics: AppliedMetricType[],
  ) {
    if (appliedMetrics.length === 0) return [eb.fn.countAll().as("count")];
    return appliedMetrics.map((metric) =>
      this.astAggregate(eb, metric, aliasRef(metric.alias || metric.sql)).as(
        `${metric.aggregation}_${metric.alias || metric.sql}`,
      ),
    );
  }

  /** {@link translateAggregation} of `value`. */
  private astAggregate<DB, TB extends keyof DB>(
    eb: ExpressionBuilder<DB, TB>,
    metric: AppliedMetricType,
    value: Expression<unknown>,
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
        return histogram(this.chartConfig?.bins ?? 10, toFloat64(value));
      case "uniq":
        return uniq(value);
      default:
        throw new InvalidRequestError(
          `Invalid aggregation: ${aggregation satisfies never}`,
        );
    }
  }

  /**
   * The ClickHouse SQL and parameters of `query` for `projectId`. The v2
   * observations view compiles through the query AST
   * ({@link buildEventsObservations}); every other view and version is
   * assembled as SQL text ({@link buildSqlText}).
   *
   * Errors: `InvalidRequestError` for a query the schema or the view rejects.
   */
  public async build(
    query: QueryType,
    projectId: string,
    enableSingleLevelOptimization = false,
  ): Promise<{ query: string; parameters: Record<string, unknown> }> {
    const parseResult = queryModel.safeParse(query);
    if (!parseResult.success) {
      throw new InvalidRequestError(
        `Invalid query: ${JSON.stringify(parseResult.error.issues)}`,
      );
    }
    const view = this.getViewDeclaration(query.view);
    if (view === eventsObservationsView) {
      return this.buildEventsObservations(
        query,
        projectId,
        enableSingleLevelOptimization,
        shouldSkipScoresDedup(projectId),
      );
    }
    return this.buildSqlText(
      query,
      view,
      projectId,
      enableSingleLevelOptimization,
    );
  }

  /**
   * `query` over `declaredView`, assembled as SQL text.
   *
   * When enableSingleLevelOptimization is false (default), the query follows a two-level pattern:
   * ```
   *   SELECT
   *     <...dimensions>,
   *     <...metrics.map(metric => `${metric.aggregation}(${metric.alias})`>
   *   FROM (
   *      SELECT
   *        <baseCte>.project_id,
   *        <baseCte>.id
   *        <...dimensions.map(dimension => `any(${dimension.sql}) as ${dimension.alias}`>,
   *        <...metrics.map(metric => `${metric.sql} as ${metric.alias || metric.sql}`>
   *      FROM <baseCte>
   *      (...tableRelations.joinConditionSql)
   *      WHERE <...filters>
   *      GROUP BY <baseCte>.project_id, <baseCte>.id
   *   )
   *   GROUP BY <...dimensions>
   *   ORDER BY <fields with directions>
   * ```
   *
   * When `enableSingleLevelOptimization` is true AND `canUseSingleLevelQuery()` returns true,
   * the query uses a single-level pattern (skips high-cardinality GROUP BY):
   * ```
   *   SELECT
   *     <...dimensions>,
   *     <...metrics.map(metric => `${metric.aggregation}(stripped ${metric.sql})`>
   *   FROM <baseCte>
   *   (...tableRelations.joinConditionSql)
   *   WHERE <...filters>
   *   GROUP BY <...dimensions>
   *   ORDER BY <fields with directions>
   * ```
   *
   * Note: Template placeholders @@AGGN@@ in metric SQL are substituted with:
   * - Two-level mode: Actual aggregation from aggs config (e.g., sum, any, sumMap)
   * - Single-level mode: Stripped out, user's aggregation applied directly to raw expression
   */
  private async buildSqlText(
    query: QueryType,
    declaredView: ViewDeclarationType,
    projectId: string,
    enableSingleLevelOptimization: boolean,
  ): Promise<{ query: string; parameters: Record<string, unknown> }> {
    // Initialize parameters object
    const parameters: Record<string, unknown> = {};

    // Check if we should skip FINAL modifier for observations (OTEL optimization)
    const skipObservationsFinal = await shouldSkipObservationsFinal(projectId);
    const skipScoresFinal = shouldSkipScoresDedup(projectId);
    let view = declaredView;

    // Events table never needs FINAL modifier (already deduplicated)
    if (view.name === "events-observations") {
      // baseCte already set to "events_core" in view definition (no FINAL)
      // No changes needed, just using as-is
    }
    // Skip FINAL on observations base table if OTEL project
    else if (view.name === "observations" && skipObservationsFinal) {
      view = {
        ...view,
        baseCte: "observations", // Remove FINAL (was "observations FINAL")
      };
    } else if (view.baseCte.startsWith("scores ") && skipScoresFinal) {
      view = {
        ...view,
        baseCte: view.baseCte.replace(/\s+FINAL$/, ""),
      };
    }

    // Map dimensions and metrics
    const requestedDimensions = this.mapDimensions(query.dimensions, view);
    const appliedMetrics = this.mapMetrics(query.metrics, view);
    const appliedBucketingDimension = this.applyBucketingDimension(query, view);

    const appliedDimensions = this.withRequiredDimensions(
      requestedDimensions,
      appliedMetrics,
      view,
    );

    // Create filters: normal WHERE filters + raw WHERE parts (filterSql pruning + exact match)
    let mappedFilters = this.mapFilters(query.filters, view);

    // events_core stores metadata_values truncated to 200 chars (events_core_mv);
    // truncation-sensitive filters must read events_full or matches beyond the
    // truncation point are silently dropped. Re-map so filter prefixes follow.
    if (
      this.actualTableName(view) === "events_core" &&
      filtersRequireEventsFull(new FilterList(mappedFilters.whereFilters))
    ) {
      view = {
        ...view,
        baseCte: view.baseCte.replace("events_core", "events_full"),
      };
      mappedFilters = this.mapFilters(query.filters, view);
    }

    const { whereFilters, whereRawParts } = mappedFilters;
    let filterList = new FilterList(whereFilters);

    // Add standard filters (project_id, timestamps)
    filterList = this.addStandardFilters(
      filterList,
      view,
      projectId,
      query.fromTimestamp,
      query.toTimestamp,
    );

    // Build the FROM clause with necessary JOINs
    let fromClause = `FROM ${view.baseCte}`;

    // Handle relation tables
    const relationTables = this.collectRelationTables(
      view,
      appliedDimensions,
      appliedMetrics,
      filterList,
      appliedBucketingDimension,
    );
    if (relationTables.size > 0) {
      const relationJoins = this.buildJoins(
        relationTables,
        view,
        filterList,
        query,
        skipObservationsFinal,
        skipScoresFinal,
      );
      fromClause += ` ${relationJoins.join(" ")}`;
    }

    // ARRAY JOIN must appear after regular JOINs and before WHERE
    const arrayJoinClause = this.buildArrayJoinClause(appliedDimensions);
    if (arrayJoinClause) {
      fromClause += `\n${arrayJoinClause}`;
    }

    // Build WHERE clause with parameters
    fromClause += this.buildWhereClause(filterList, parameters);

    // Append raw WHERE pruning parts (OR'd conditions from filterSql.where)
    for (const part of whereRawParts) {
      fromClause += ` AND ${part.query}`;
      Object.assign(parameters, part.params);
    }

    // When rootEventCondition is set, add a subquery filter to restrict rows
    // to traces whose root event has timeDimension in the query window.
    // The existing start_time filter above is kept for ClickHouse partition pruning.
    // For wide time windows (default >7 days), the subquery is skipped as the
    // root-event check has diminishing returns and hurts performance.
    // Set LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS=0 to always apply the filter.
    if (view.rootEventCondition) {
      const windowMs =
        new Date(query.toTimestamp).getTime() -
        new Date(query.fromTimestamp).getTime();
      const windowHours = windowMs / (1000 * 60 * 60);
      const thresholdHours = this.rootEventConditionMaxWindowHours;

      if (thresholdHours === 0 || windowHours <= thresholdHours) {
        // Falls back gracefully: if no root events exist in the window at all
        // (e.g. parent_span_id is never populated), the filter is skipped via NOT EXISTS.
        const uid = randomUUID().replace(/-/g, "").slice(0, 8);
        const fromP = `subFrom${uid}`;
        const toP = `subTo${uid}`;
        const projP = `subProj${uid}`;
        const baseTable = this.actualTableName(view);
        const tableAlias = this.tableAlias(view);
        const { column, condition } = view.rootEventCondition;
        const fromParam = bindUtcDateTimeParam(
          fromP,
          new Date(query.fromTimestamp),
        );
        const toParam = bindUtcDateTimeParam(toP, new Date(query.toTimestamp));
        const subquery =
          `SELECT ${tableAlias}.${column} FROM ${baseTable} ${tableAlias} ` +
          `WHERE ${tableAlias}.project_id = {${projP}: String} ` +
          `AND ${condition} ` +
          `AND ${tableAlias}.${view.timeDimension} >= ${fromParam.placeholder} ` +
          `AND ${tableAlias}.${view.timeDimension} <= ${toParam.placeholder}`;
        fromClause +=
          ` AND (${baseTable}.${column} IN (${subquery})` +
          ` OR NOT EXISTS (${subquery} LIMIT 1))`;
        parameters[fromP] = fromParam.value;
        parameters[toP] = toParam.value;
        parameters[projP] = projectId;
      }
    }

    // Check if single-level optimization is applicable
    // Note: Relation tables are OK as long as measures have aggs configuration
    // A join can match several rows per score, so scores views with relation
    // tables need the per-id inner GROUP BY to count each score once.
    const isScoresView = this.actualTableName(view) === "scores";
    const canOptimize =
      (isScoresView
        ? relationTables.size === 0
        : enableSingleLevelOptimization) &&
      this.canUseSingleLevelQuery(appliedDimensions, appliedMetrics);

    // Build GROUP BY clause (used by both single-level and two-level queries)
    const groupByClause = this.buildGroupByClause(
      appliedDimensions,
      appliedBucketingDimension,
    );

    // Process and validate orderBy fields
    const processedOrderBy = this.validateAndProcessOrderBy(
      query.orderBy,
      appliedDimensions,
      appliedMetrics,
      appliedBucketingDimension,
    );

    // Build ORDER BY clause
    const orderByClause = this.buildOrderByClause(processedOrderBy);

    // Build WITH FILL clause for time dimension to fill gaps in timeseries
    const withFillClause = this.buildWithFillClause(
      appliedBucketingDimension,
      query.fromTimestamp,
      query.toTimestamp,
      query.orderBy,
      parameters,
    );

    // Build LIMIT clause for row limiting
    const limitClause = this.buildLimitClause();

    // Build final query - branch based on optimization
    let sql: string;
    if (canOptimize) {
      // Single-level query: Skip inner SELECT
      sql = this.buildSingleLevelSelect(
        view,
        appliedDimensions,
        appliedMetrics,
        appliedBucketingDimension,
        fromClause,
        groupByClause,
        orderByClause,
        withFillClause,
        limitClause,
      );
    } else {
      // Two-level query: Original approach
      // Build inner SELECT parts
      const innerDimensionsPart = this.buildInnerDimensionsPart(
        appliedDimensions,
        view,
        appliedBucketingDimension,
      );
      const innerMetricsPart = this.buildInnerMetricsPart(appliedMetrics);

      // Build inner SELECT
      const innerQuery = this.buildInnerSelect(
        view,
        innerDimensionsPart,
        innerMetricsPart,
        fromClause,
        appliedDimensions,
      );

      // Build outer SELECT parts
      const outerDimensionsPart = this.buildOuterDimensionsPart(
        appliedDimensions,
        appliedBucketingDimension,
      );
      const outerMetricsPart = this.buildOuterMetricsPart(appliedMetrics);

      sql = this.buildOuterSelect(
        outerDimensionsPart,
        outerMetricsPart,
        innerQuery,
        groupByClause,
        orderByClause,
        withFillClause,
        limitClause,
      );
    }

    return {
      query: sql,
      parameters,
    };
  }
}
