import { randomUUID } from "crypto";
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
  type granularities,
  type ViewVersion,
  type views,
  query as queryModel,
  SCORES_LISTABLE_COUNT_VIEW,
} from "../types";

import { eventsObservationsView, getViewDeclaration } from "../dataModel";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { env } from "../../../env";
import { NULL_IF_EMPTY_RE } from "./nullIfEmptyFilter";
import { buildScores, SCORE_VIEWS_V2 } from "./scoresQuery";
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
import { buildEventsObservations } from "./eventsObservationsQuery";

type RawSqlPart = { query: string; params: Record<string, unknown> };

type MappedFilters = {
  whereFilters: Filter[];
  whereRawParts: RawSqlPart[];
};

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
    validateFilters(filters, view);

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
      const dimension = resolveDimension(filter.column, view);

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

  private buildArrayJoinClause(
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
    const fill = withFillRange(
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
   * The ClickHouse SQL and parameters of `query` for `projectId`. The v2
   * observations view ({@link buildEventsObservations}) and the v2 score
   * views ({@link buildScores}) compile through the query AST; every other
   * view and version is assembled as SQL text ({@link buildSqlText}).
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
      return buildEventsObservations(
        query,
        projectId,
        enableSingleLevelOptimization,
        shouldSkipScoresDedup(projectId),
        this.version,
        this.chartConfig,
      );
    }
    if (SCORE_VIEWS_V2.has(view)) {
      return buildScores(
        query,
        view,
        projectId,
        shouldSkipScoresDedup(projectId),
        this.version,
        this.chartConfig,
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
    const requestedDimensions = mapDimensions(query.dimensions, view);
    const appliedMetrics = mapMetrics(query.metrics, view);
    const appliedBucketingDimension = applyBucketingDimension(
      query,
      view,
      this.version,
    );

    const appliedDimensions = withRequiredDimensions(
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
    const relationTables = collectRelationTables(
      appliedDimensions,
      appliedMetrics,
      appliedBucketingDimension,
    );
    filterList.forEach((filter) => {
      // Only add as relation table if it's not the base table
      if (
        filter.clickhouseTable !== view.name &&
        filter.clickhouseTable !== this.actualTableName(view)
      ) {
        relationTables.add(filter.clickhouseTable);
      }
    });
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
      canUseSingleLevelQuery(appliedDimensions, appliedMetrics);

    // Build GROUP BY clause (used by both single-level and two-level queries)
    const groupByClause = this.buildGroupByClause(
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
