/**
 * The SQL-text path of the dashboard query builder ({@link buildSqlText}):
 * every view and version that does not compile through the query AST is
 * assembled here as ClickHouse SQL text from the `sql` strings and
 * `@@AGGn@@` templates of `dataModel.ts`, with its filters lowered through
 * `FilterList`: joins, WHERE, the inner, outer and single-level selects,
 * WITH FILL, ORDER BY and LIMIT. The steps it shares with the AST views are
 * in `viewQuerySteps.ts`; `QueryBuilder` dispatches the views here.
 */
import { type z } from "zod";
import {
  shouldSkipObservationsFinal,
  shouldSkipScoresDedup,
} from "../../../server/queries/clickhouse-sql/query-options";
import {
  bindUtcDateTimeParam,
  FilterList,
  type Filter,
} from "../../../server/queries/clickhouse-sql/clickhouse-filter";
import { createFilterFromFilterState } from "../../../server/queries/clickhouse-sql/factory";
import {
  type QueryType,
  type ViewDeclarationType,
  type granularities,
  type ViewVersion,
  query as queryModel,
} from "../types";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { NULL_IF_EMPTY_RE } from "./nullIfEmptyFilter";
import {
  type AppliedDimensionType,
  type AppliedMetricType,
  type AppliedBucketingDimension,
  WITH_FILL_STEPS,
  assertKnownRelationTables,
  applyBucketingDimension,
  mapDimensions,
  mapMetrics,
  withRequiredDimensions,
  validateFilters,
  resolveDimension,
  collectRelationTables,
  canUseSingleLevelQuery,
  pairExpandDimension,
  withFillRange,
  validateAndProcessOrderBy,
} from "./viewQuerySteps";

function translateAggregation(
  metric: AppliedMetricType,
  bins: number | undefined,
): string {
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
      return `histogram(${bins ?? 10})(toFloat64(${metric.alias || metric.sql}))`;
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

function baseTableName(view: ViewDeclarationType): string {
  // Extract actual table name from baseCte (e.g., "events_core events_traces" -> "events_core")
  return view.baseCte.split(" ")[0];
}

/**
 * The `FilterList` filters of `filters` on `view`: a dimension compares its
 * `sql` (the raw column of a `nullIf(column, '')` one, with `''` as NULL),
 * the time dimension and `metadata` their columns, another `…Name` column
 * `name`. Throws `InvalidRequestError` for a filter the view rejects.
 */
function mapFilters(
  filters: z.infer<typeof queryModel>["filters"],
  view: ViewDeclarationType,
): Filter[] {
  // Validate all filters before processing
  validateFilters(filters, view);

  const actualTableName = baseTableName(view);

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
    const dimension = resolveDimension(filter.column, view);

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

  return createFilterFromFilterState(normalFilters, normalMappings);
}

function addStandardFilters(
  filterList: FilterList,
  view: ViewDeclarationType,
  projectId: string,
  fromTimestamp: string,
  toTimestamp: string,
) {
  const actualTableName = baseTableName(view);

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

function substituteAggTemplates(
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

function buildJoins(
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

function buildArrayJoinClause(
  appliedDimensions: AppliedDimensionType[],
): string {
  const d = pairExpandDimension(appliedDimensions);
  if (!d) return "";
  return `ARRAY JOIN\n  ${d.sql} AS ${d.alias ?? d.sql},\n  ${d.pairExpand!.valuesSql} AS ${d.pairExpand!.valueAlias}`;
}

/**
 * ARRAY JOIN already binds the pairExpand key (`mapKeys(...) AS costType`).
 * Selecting `costType AS costType` in the same query makes ClickHouse throw
 * "Duplicate alias in ARRAY JOIN".
 */
function pairExpandKeyColumn(dimension: AppliedDimensionType): string {
  return dimension.alias ?? dimension.sql;
}

function buildWhereClause(
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

function getTimeDimensionSql(
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

function buildTimeDimensionSql(
  view: ViewDeclarationType,
  appliedBucketingDimension: Extract<
    AppliedBucketingDimension,
    { type: "time" }
  >,
  wrapInAgg?: string,
): string {
  const actualTableName = baseTableName(view);
  const timeDimensionSql = getTimeDimensionSql(
    `${actualTableName}.${view.timeDimension}`,
    appliedBucketingDimension.granularity,
  );

  // Optionally wrap in aggregation function (e.g., "any" for two-level inner SELECT).
  const wrappedSql = wrapInAgg
    ? `${wrapInAgg}(${timeDimensionSql})`
    : timeDimensionSql;

  return `${wrappedSql} as time_dimension`;
}

function buildBucketDimensionSql(
  view: ViewDeclarationType,
  appliedBucketingDimension: AppliedBucketingDimension,
  wrapInAgg?: string,
): string {
  switch (appliedBucketingDimension.type) {
    case "none":
      return "";
    case "time":
      return buildTimeDimensionSql(view, appliedBucketingDimension, wrapInAgg);
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

/**
 * The dimensions and bucket of a two-level inner select: `any(<sql>) as
 * <alias>`, the bare key of a pair-expanded dimension, `arrayJoin(<sql>)`
 * of an exploded one, each followed by a comma.
 */
function buildInnerDimensionsPart(
  appliedDimensions: AppliedDimensionType[],
  view: ViewDeclarationType,
  appliedBucketingDimension: AppliedBucketingDimension,
) {
  let dimensions = "";

  // Add regular dimensions
  if (appliedDimensions.length > 0) {
    dimensions += `${appliedDimensions
      .map((dimension) => {
        // pairExpand key columns (e.g. costType) are added to the inner GROUP BY in
        // buildInnerSelect, so they are already deterministic grouping keys here.
        // Unlike regular dimensions (which are not in GROUP BY and need any() to satisfy
        // ClickHouse's aggregation rules), wrapping in any() would be wrong: it implies
        // the value is non-deterministic within the group when it's actually the axis
        // being grouped on. Use a bare reference instead.
        // Note: the paired value column (e.g. cost_value) is NOT in GROUP BY and IS
        // wrapped in any() in buildInnerMetricsPart, so the outer query can re-aggregate it.
        if (dimension.pairExpand) {
          return pairExpandKeyColumn(dimension);
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
  const bucketDimensionSql = buildBucketDimensionSql(
    view,
    appliedBucketingDimension,
    "any",
  );
  if (bucketDimensionSql) {
    dimensions += `${bucketDimensionSql},`;
  }

  return dimensions;
}

function buildInnerMetricsPart(appliedMetrics: AppliedMetricType[]) {
  if (appliedMetrics.length === 0) {
    return "count(*) as count";
  }

  return appliedMetrics
    .map((metric) => {
      let sql = metric.sql;

      // For two-level queries, substitute @@AGGN@@ with actual agg function from template
      if (metric.aggs) {
        sql = substituteAggTemplates(sql, metric.aggs);
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

function buildInnerSelect(
  view: ViewDeclarationType,
  innerDimensionsPart: string,
  innerMetricsPart: string,
  fromClause: string,
  appliedDimensions: AppliedDimensionType[],
) {
  const actualTableName = baseTableName(view);
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

function buildOuterDimensionsPart(
  appliedDimensions: AppliedDimensionType[],
  appliedBucketingDimension: AppliedBucketingDimension,
) {
  let dimensions = "";

  // Add regular dimensions
  if (appliedDimensions.length > 0) {
    dimensions += `${appliedDimensions
      .map((dimension) =>
        dimension.pairExpand
          ? pairExpandKeyColumn(dimension)
          : `${dimension.alias ?? dimension.sql} as ${dimension.alias || dimension.sql}`,
      )
      .join(",\n")},`;
  }

  if (appliedBucketingDimension.type !== "none") {
    dimensions += `${appliedBucketingDimension.bucketDimensionAlias},`;
  }

  return dimensions;
}

function buildOuterMetricsPart(
  appliedMetrics: AppliedMetricType[],
  bins: number | undefined,
) {
  return appliedMetrics.length > 0
    ? `${appliedMetrics.map((metric) => `${translateAggregation(metric, bins)} as ${metric.aggregation}_${metric.alias || metric.sql}`).join(",\n")}`
    : "count(*) as count";
}

function buildGroupByClause(
  appliedDimensions: AppliedDimensionType[],
  appliedBucketingDimension: AppliedBucketingDimension,
) {
  const dimensions = [];

  // Add regular dimensions
  if (appliedDimensions.length > 0) {
    dimensions.push(
      ...appliedDimensions.map((dimension) => dimension.alias ?? dimension.sql),
    );
  }

  if (appliedBucketingDimension.type !== "none") {
    dimensions.push(appliedBucketingDimension.bucketDimensionAlias);
  }

  return dimensions.length > 0 ? `GROUP BY ${dimensions.join(",\n")}` : "";
}

/**
 * Builds a WITH FILL clause for time dimension to ensure continuous time series data.
 * This fills in gaps in the time series with zero values based on the granularity.
 * Only applied if timeDimension is used and no ORDER BY is specified.
 */
function buildWithFillClause(
  appliedBucketingDimension: AppliedBucketingDimension,
  fromTimestamp: string,
  toTimestamp: string,
  orderBy: Array<{ field: string; direction: string }> | null,
  parameters: Record<string, unknown>,
): string {
  const fill = withFillRange(
    appliedBucketingDimension,
    fromTimestamp,
    toTimestamp,
    orderBy,
  );
  if (!fill) return "";
  const { fromDate, toDate, granularity } = fill;
  const { sql: step } =
    granularity === "auto" ? WITH_FILL_STEPS.day : WITH_FILL_STEPS[granularity];

  const fillFromDateParam = bindUtcDateTimeParam("fillFromDate", fromDate);
  const fillToDateParam = bindUtcDateTimeParam("fillToDate", toDate);
  parameters["fillFromDate"] = fillFromDateParam.value;
  parameters["fillToDate"] = fillToDateParam.value;

  return ` WITH FILL FROM ${getTimeDimensionSql(fillFromDateParam.placeholder, granularity)} TO ${getTimeDimensionSql(fillToDateParam.placeholder, granularity)} STEP ${step}`;
}

/**
 * Builds a LIMIT clause for the query if `rowLimit` (the chart config's
 * row_limit) is set.
 */
function buildLimitClause(rowLimit: number | undefined): string {
  if (!rowLimit) return "";
  return `LIMIT ${rowLimit}`;
}

function buildOuterSelect(
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

function buildSingleLevelMetricsPart(
  appliedMetrics: AppliedMetricType[],
  bins: number | undefined,
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
      const aggregatedSql = translateAggregation(
        {
          ...m,
          sql: baseSql,
          alias: undefined, // Force use of sql instead of alias
        },
        bins,
      );
      return `${aggregatedSql} as ${m.aggregation}_${m.alias || m.sql}`;
    })
    .join(",\n");
}

function buildSingleLevelDimensionsPart(
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
            return pairExpandKeyColumn(d);
          }
          if (d.explodeArray) {
            return `arrayJoin(${d.sql}) as ${d.alias ?? d.sql}`;
          }
          return `${d.sql} as ${d.alias ?? d.sql}`;
        })
        .join(",\n") + ",\n";
  }

  // Reuse unified bucket dimension builder (no wrapper for single-level).
  const bucketDimensionSql = buildBucketDimensionSql(
    view,
    appliedBucketingDimension,
  );
  if (bucketDimensionSql) {
    dimensionsPart += `${bucketDimensionSql},\n`;
  }

  return dimensionsPart;
}

function buildSingleLevelSelect(
  view: ViewDeclarationType,
  appliedDimensions: AppliedDimensionType[],
  appliedMetrics: AppliedMetricType[],
  appliedBucketingDimension: AppliedBucketingDimension,
  fromClause: string,
  groupByClause: string,
  orderByClause: string,
  withFillClause: string,
  limitClause: string,
  bins: number | undefined,
): string {
  // Build dimensions using dedicated helper
  const dimensionsPart = buildSingleLevelDimensionsPart(
    appliedDimensions,
    view,
    appliedBucketingDimension,
  );

  // Build optimized metrics (strip templates, apply user aggregation)
  const metricsPart = buildSingleLevelMetricsPart(appliedMetrics, bins);

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
 * Builds the ORDER BY clause for the query.
 */
function buildOrderByClause(
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
 *
 * `version` and `chartConfig` (histogram bins, row limit) are the
 * `QueryBuilder`'s.
 */
export async function buildSqlText(
  query: QueryType,
  declaredView: ViewDeclarationType,
  projectId: string,
  enableSingleLevelOptimization: boolean,
  version: ViewVersion,
  chartConfig: { bins?: number; row_limit?: number } | undefined,
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
  const requestedDimensions = mapDimensions(query.dimensions, view);
  const appliedMetrics = mapMetrics(query.metrics, view);
  const appliedBucketingDimension = applyBucketingDimension(
    query,
    view,
    version,
  );

  const appliedDimensions = withRequiredDimensions(
    requestedDimensions,
    appliedMetrics,
    view,
  );

  let filterList = new FilterList(mapFilters(query.filters, view));

  // Add standard filters (project_id, timestamps)
  filterList = addStandardFilters(
    filterList,
    view,
    projectId,
    query.fromTimestamp,
    query.toTimestamp,
  );

  // Build the FROM clause with necessary JOINs
  let fromClause = `FROM ${view.baseCte}`;

  // Handle relation tables
  const relationTables = collectRelationTables(
    appliedDimensions,
    appliedMetrics,
    appliedBucketingDimension,
  );
  filterList.forEach((filter) => {
    // Only add as relation table if it's not the base table
    if (
      filter.clickhouseTable !== view.name &&
      filter.clickhouseTable !== baseTableName(view)
    ) {
      relationTables.add(filter.clickhouseTable);
    }
  });
  if (relationTables.size > 0) {
    const relationJoins = buildJoins(
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
  const arrayJoinClause = buildArrayJoinClause(appliedDimensions);
  if (arrayJoinClause) {
    fromClause += `\n${arrayJoinClause}`;
  }

  // Build WHERE clause with parameters
  fromClause += buildWhereClause(filterList, parameters);

  // Check if single-level optimization is applicable
  // Note: Relation tables are OK as long as measures have aggs configuration
  // A join can match several rows per score, so scores views with relation
  // tables need the per-id inner GROUP BY to count each score once.
  const isScoresView = baseTableName(view) === "scores";
  const canOptimize =
    (isScoresView
      ? relationTables.size === 0
      : enableSingleLevelOptimization) &&
    canUseSingleLevelQuery(appliedDimensions, appliedMetrics);

  // Build GROUP BY clause (used by both single-level and two-level queries)
  const groupByClause = buildGroupByClause(
    appliedDimensions,
    appliedBucketingDimension,
  );

  // Process and validate orderBy fields
  const processedOrderBy = validateAndProcessOrderBy(
    query.orderBy,
    appliedDimensions,
    appliedMetrics,
    appliedBucketingDimension,
  );

  // Build ORDER BY clause
  const orderByClause = buildOrderByClause(processedOrderBy);

  // Build WITH FILL clause for time dimension to fill gaps in timeseries
  const withFillClause = buildWithFillClause(
    appliedBucketingDimension,
    query.fromTimestamp,
    query.toTimestamp,
    query.orderBy,
    parameters,
  );

  // Build LIMIT clause for row limiting
  const limitClause = buildLimitClause(chartConfig?.row_limit);

  // Build final query - branch based on optimization
  let sql: string;
  if (canOptimize) {
    // Single-level query: Skip inner SELECT
    sql = buildSingleLevelSelect(
      view,
      appliedDimensions,
      appliedMetrics,
      appliedBucketingDimension,
      fromClause,
      groupByClause,
      orderByClause,
      withFillClause,
      limitClause,
      chartConfig?.bins,
    );
  } else {
    // Two-level query: Original approach
    // Build inner SELECT parts
    const innerDimensionsPart = buildInnerDimensionsPart(
      appliedDimensions,
      view,
      appliedBucketingDimension,
    );
    const innerMetricsPart = buildInnerMetricsPart(appliedMetrics);

    // Build inner SELECT
    const innerQuery = buildInnerSelect(
      view,
      innerDimensionsPart,
      innerMetricsPart,
      fromClause,
      appliedDimensions,
    );

    // Build outer SELECT parts
    const outerDimensionsPart = buildOuterDimensionsPart(
      appliedDimensions,
      appliedBucketingDimension,
    );
    const outerMetricsPart = buildOuterMetricsPart(
      appliedMetrics,
      chartConfig?.bins,
    );

    sql = buildOuterSelect(
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
