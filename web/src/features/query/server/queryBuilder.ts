import { type z } from "zod/v4";
import {
  convertDateToClickhouseDateTime,
  shouldSkipObservationsFinal,
} from "@langfuse/shared/src/server";
import type {
  QueryType,
  ViewDeclarationType,
  metricAggregations,
  granularities,
  ViewVersion,
  views,
} from "../types";
import { query as queryModel } from "../types";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import {
  FilterList,
  createFilterFromFilterState,
} from "@langfuse/shared/src/server";
import { InvalidRequestError } from "@langfuse/shared";

type AppliedDimensionType = {
  table: string;
  sql: string;
  alias?: string;
  relationTable?: string;
  aggregationFunction?: string;
  explodeArray?: boolean;
};

type AppliedMetricType = {
  sql: string;
  aggregation: z.infer<typeof metricAggregations>;
  alias?: string;
  relationTable?: string;
  aggs?: Record<string, string>;
  measureName: string; // Original measure name for lookups
};

export class QueryBuilder {
  private chartConfig?: { bins?: number; row_limit?: number };
  private version: ViewVersion;

  constructor(
    chartConfig?: { bins?: number; row_limit?: number },
    version: ViewVersion = "v1",
  ) {
    this.chartConfig = chartConfig;
    this.version = version;
  }

  private translateAggregation(metric: AppliedMetricType): string {
    switch (metric.aggregation) {
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
      case "histogram":
        // Get histogram bins from chart config, fallback to 10
        const bins = this.chartConfig?.bins ?? 10;
        return `histogram(${bins})(toFloat64(${metric.alias || metric.sql}))`;
      default:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustiveCheck: never = metric.aggregation;
        throw new InvalidRequestError(
          `Invalid aggregation: ${metric.aggregation}`,
        );
    }
  }

  private getViewDeclaration(
    viewName: z.infer<typeof views>,
  ): ViewDeclarationType {
    return getViewDeclaration(viewName, this.version);
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
        table: dim.relationTable || view.name,
        explodeArray: dim.explodeArray,
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
      return {
        ...view.measures[metric.measure],
        aggregation: metric.aggregation,
        aggs: view.measures[metric.measure].aggs,
        measureName: metric.measure,
      };
    });
  }

  private validateFilters(
    filters: z.infer<typeof queryModel>["filters"],
    view: ViewDeclarationType,
  ) {
    for (const filter of filters) {
      // Validate filters on dimension fields
      if (filter.column in view.dimensions) {
        const dimension = view.dimensions[filter.column];

        // Array fields (like tags) validation
        if (dimension.type === "string[]") {
          if (filter.type === "string") {
            throw new InvalidRequestError(
              `Invalid filter for field '${filter.column}': Array fields require type 'arrayOptions', not 'string'. ` +
                `Use operators like 'any of', 'all of', or 'none of' with an array of values.`,
            );
          }

          // Additional validation: ensure value is array for arrayOptions
          if (filter.type === "arrayOptions" && !Array.isArray(filter.value)) {
            throw new InvalidRequestError(
              `Invalid filter for field '${filter.column}': arrayOptions type requires an array of values, not '${typeof filter.value}'.`,
            );
          }
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

  private mapFilters(
    filters: z.infer<typeof queryModel>["filters"],
    view: ViewDeclarationType,
  ) {
    // Validate all filters before processing
    this.validateFilters(filters, view);

    const actualTableName = this.actualTableName(view);

    // Transform our filters to match the column mapping format expected by createFilterFromFilterState
    const columnMappings = filters.map((filter) => {
      let clickhouseSelect: string;
      let queryPrefix: string = "";
      let clickhouseTableName: string = actualTableName;
      let type: string;

      if (filter.column in view.dimensions) {
        const dimension = view.dimensions[filter.column];
        clickhouseSelect = dimension.sql;
        type = "string";
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

      return {
        uiTableName: filter.column,
        uiTableId: filter.column,
        clickhouseTableName,
        clickhouseSelect,
        queryPrefix,
        type,
      };
    });

    // Use the createFilterFromFilterState function to create proper Clickhouse filters
    return createFilterFromFilterState(filters, columnMappings);
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
  ) {
    const relationTables = new Set<string>();
    const actualTableName = this.actualTableName(view);

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
    // 1. All metrics have aggs configuration
    // 2. No custom aggregation functions on dimensions
    // Measures without .aggs: {} (like uniq(scores.id)) must use two-level approach
    const allMetricsHaveAggs =
      appliedMetrics.length === 0 ||
      appliedMetrics.every((m) => m.aggs !== undefined);

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
  ) {
    const relationJoins = [];
    for (const relationTableName of relationTables) {
      if (!(relationTableName in view.tableRelations)) {
        throw new InvalidRequestError(
          `Invalid relationTable: ${relationTableName}. Must be one of ${Object.keys(view.tableRelations)}`,
        );
      }

      const relation = view.tableRelations[relationTableName];
      // Conditionally add FINAL - skip for observations if flag is set
      const shouldUseFinal = !(
        relation.name === "observations" && skipObservationsFinal
      );
      const alias =
        relation.name !== relationTableName ? ` AS ${relationTableName}` : "";
      let joinStatement = `LEFT JOIN ${relation.name}${alias}${shouldUseFinal ? " FINAL" : ""} ${relation.joinConditionSql}`;

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
    } else if (diffHours < 72) {
      return "hour"; // Less than 3 days, use hours
    } else if (diffHours < 1440) {
      return "day"; // Less than 60 days, use days
    } else if (diffHours < 8760) {
      return "week"; // Less than a year, use weeks
    } else {
      return "month"; // Over a year, use months
    }
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
      case "auto":
        throw new Error(
          `Granularity 'auto' is not supported for getTimeDimensionSql`,
        );
      default:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustiveCheck: never = granularity;
        throw new InvalidRequestError(
          `Invalid time granularity: ${granularity}. Must be one of minute, hour, day, week, month`,
        );
    }
  }

  private buildTimeDimensionSql(
    view: ViewDeclarationType,
    query: QueryType,
    wrapInAgg?: string,
  ): string {
    if (!query.timeDimension) {
      return "";
    }

    const actualTableName = this.actualTableName(view);
    const granularity =
      query.timeDimension.granularity === "auto"
        ? this.determineTimeGranularity(query.fromTimestamp, query.toTimestamp)
        : query.timeDimension.granularity;

    const timeDimensionSql = this.getTimeDimensionSql(
      `${actualTableName}.${view.timeDimension}`,
      granularity,
    );

    // Optionally wrap in aggregation function (e.g., "any" for two-level inner SELECT).
    // When the view has a rootEventCondition, use anyIf with that condition so that
    // only the root event's timestamp is used for time bucketing (not observations).
    // The condition column is prefixed with the table alias to avoid ambiguity in
    // future views that may involve JOINs.
    let wrappedSql: string;
    if (wrapInAgg && view.rootEventCondition) {
      const alias = this.tableAlias(view);
      wrappedSql = `anyIf(${timeDimensionSql}, ${alias}.${view.rootEventCondition.condition})`;
    } else if (wrapInAgg) {
      wrappedSql = `${wrapInAgg}(${timeDimensionSql})`;
    } else {
      wrappedSql = timeDimensionSql;
    }

    return `${wrappedSql} as time_dimension`;
  }

  private buildInnerDimensionsPart(
    appliedDimensions: AppliedDimensionType[],
    query: QueryType,
    view: ViewDeclarationType,
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
          // Explode array dimensions using arrayJoin
          if (dimension.explodeArray) {
            return `arrayJoin(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`;
          }
          // Default: wrap in any()
          return `any(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`;
        })
        .join(",\n")},`;
    }

    // Add time dimension if specified - reuse unified builder with any() wrapper
    const timeDimensionSql = this.buildTimeDimensionSql(view, query, "any");
    if (timeDimensionSql) {
      dimensions += `${timeDimensionSql},`;
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

        // For two-level queries, substitute ${aggN} with actual agg function from template
        if (metric.aggs) {
          sql = this.substituteAggTemplates(sql, metric.aggs);
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
    const groupByParts = [projectIdSql, idSql];
    for (const dim of appliedDimensions) {
      if (dim.explodeArray) {
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
    hasTimeDimension: boolean,
  ) {
    let dimensions = "";

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions += `${appliedDimensions
        .map(
          (dimension) =>
            `${dimension.alias ?? dimension.sql} as ${dimension.alias || dimension.sql}`,
        )
        .join(",\n")},`;
    }

    // Add time dimension if it exists
    if (hasTimeDimension) {
      dimensions += `time_dimension,`;
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
    hasTimeDimension: boolean,
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

    // Add time dimension if it exists
    if (hasTimeDimension) {
      dimensions.push("time_dimension");
    }

    return dimensions.length > 0 ? `GROUP BY ${dimensions.join(",\n")}` : "";
  }

  /**
   * Builds a WITH FILL clause for time dimension to ensure continuous time series data.
   * This fills in gaps in the time series with zero values based on the granularity.
   * Only applied if timeDimension is used and no ORDER BY is specified.
   */
  private buildWithFillClause(
    timeDimension: {
      granularity: z.infer<typeof granularities>;
    } | null,
    fromTimestamp: string,
    toTimestamp: string,
    orderBy: Array<{ field: string; direction: string }> | null,
    parameters: Record<string, unknown>,
  ): string {
    if (!timeDimension) {
      return "";
    }

    if (orderBy && orderBy.length > 0) {
      return ""; // Skip WITH FILL if ORDER BY is specified
    }

    // Determine granularity for WITH FILL if timeDimension is used
    const granularity =
      timeDimension.granularity === "auto"
        ? this.determineTimeGranularity(fromTimestamp, toTimestamp)
        : timeDimension.granularity;

    // Calculate appropriate STEP for WITH FILL based on granularity
    let step: string;
    switch (granularity) {
      case "minute":
        step = "INTERVAL 1 MINUTE";
        break;
      case "hour":
        step = "INTERVAL 1 HOUR";
        break;
      case "day":
        step = "INTERVAL 1 DAY";
        break;
      case "week":
        step = "INTERVAL 1 WEEK";
        break;
      case "month":
        step = "INTERVAL 1 MONTH";
        break;
      default:
        step = "INTERVAL 1 DAY"; // Default to day if granularity is unknown
    }

    parameters["fillFromDate"] = convertDateToClickhouseDateTime(
      new Date(fromTimestamp),
    );
    parameters["fillToDate"] = convertDateToClickhouseDateTime(
      new Date(toTimestamp),
    );

    return ` WITH FILL FROM ${this.getTimeDimensionSql("{fillFromDate: DateTime64(3)}", granularity)} TO ${this.getTimeDimensionSql("{fillToDate: DateTime64(3)}", granularity)} STEP ${step}`;
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
    query: QueryType,
    view: ViewDeclarationType,
  ): string {
    let dimensionsPart = "";
    if (appliedDimensions.length > 0) {
      dimensionsPart =
        appliedDimensions
          .map((d) => {
            if (d.explodeArray) {
              return `arrayJoin(${d.sql}) as ${d.alias ?? d.sql}`;
            }
            return `${d.sql} as ${d.alias ?? d.sql}`;
          })
          .join(",\n") + ",\n";
    }

    // Reuse unified time dimension builder (no wrapper for single-level)
    const timeDimensionSql = this.buildTimeDimensionSql(view, query);
    if (timeDimensionSql) {
      dimensionsPart += `${timeDimensionSql},\n`;
    }

    return dimensionsPart;
  }

  private buildSingleLevelSelect(
    view: ViewDeclarationType,
    appliedDimensions: AppliedDimensionType[],
    appliedMetrics: AppliedMetricType[],
    query: QueryType,
    fromClause: string,
    groupByClause: string,
    orderByClause: string,
    withFillClause: string,
    limitClause: string,
  ): string {
    // Build dimensions using dedicated helper
    const dimensionsPart = this.buildSingleLevelDimensionsPart(
      appliedDimensions,
      query,
      view,
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
    hasTimeDimension: boolean,
  ): Array<{ field: string; direction: string }> {
    if (!orderBy || orderBy.length === 0) {
      // Default order: time dimension if available, otherwise first metric, otherwise first dimension
      if (hasTimeDimension) {
        return [{ field: "time_dimension", direction: "asc" }];
      } else if (appliedMetrics.length > 0) {
        const firstMetric = appliedMetrics[0];
        return [
          {
            field: `${firstMetric.aggregation}_${firstMetric.alias || firstMetric.sql}`,
            direction: "desc",
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
      // Check if the field is a time dimension
      if (hasTimeDimension && item.field === "time_dimension") {
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
        /^(sum|avg|count|max|min|p50|p75|p90|p95|p99)_(.+)$/;
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
   * We want to build a ClickHouse query based on the query provided and the viewDeclaration that was selected.
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
  public async build(
    query: QueryType,
    projectId: string,
    enableSingleLevelOptimization: boolean = false,
  ): Promise<{ query: string; parameters: Record<string, unknown> }> {
    // Run zod validation
    const parseResult = queryModel.safeParse(query);
    if (!parseResult.success) {
      throw new InvalidRequestError(
        `Invalid query: ${JSON.stringify(parseResult.error.issues)}`,
      );
    }

    // Initialize parameters object
    const parameters: Record<string, unknown> = {};

    // Check if we should skip FINAL modifier for observations (OTEL optimization)
    const skipObservationsFinal = await shouldSkipObservationsFinal(projectId);
    let view = this.getViewDeclaration(query.view);

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
    }

    // Map dimensions and metrics
    const appliedDimensions = this.mapDimensions(query.dimensions, view);
    const appliedMetrics = this.mapMetrics(query.metrics, view);

    // Create a new FilterList with the mapped filters
    let filterList = new FilterList(this.mapFilters(query.filters, view));

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
    );
    if (relationTables.size > 0) {
      const relationJoins = this.buildJoins(
        relationTables,
        view,
        filterList,
        query,
        skipObservationsFinal,
      );
      fromClause += ` ${relationJoins.join(" ")}`;
    }

    // Build WHERE clause with parameters
    fromClause += this.buildWhereClause(filterList, parameters);

    // When rootEventCondition is set, add a subquery filter to restrict rows
    // to traces whose root event has timeDimension in the query window.
    // The existing start_time filter above is kept for ClickHouse partition pruning.
    if (view.rootEventCondition) {
      const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const fromP = `subFrom${uid}`;
      const toP = `subTo${uid}`;
      const projP = `subProj${uid}`;
      const baseTable = this.actualTableName(view);
      const { column, condition } = view.rootEventCondition;
      fromClause +=
        ` AND ${baseTable}.${column} IN (` +
        `SELECT ${column} FROM ${baseTable} ` +
        `WHERE project_id = {${projP}: String} ` +
        `AND ${condition} ` +
        `AND ${view.timeDimension} >= {${fromP}: DateTime64(3)} ` +
        `AND ${view.timeDimension} <= {${toP}: DateTime64(3)})`;
      parameters[fromP] = new Date(query.fromTimestamp).getTime();
      parameters[toP] = new Date(query.toTimestamp).getTime();
      parameters[projP] = projectId;
    }

    // Check if single-level optimization is applicable
    // Note: Relation tables are OK as long as measures have aggs configuration
    const canOptimize =
      enableSingleLevelOptimization &&
      this.canUseSingleLevelQuery(appliedDimensions, appliedMetrics);

    // Build GROUP BY clause (used by both single-level and two-level queries)
    const groupByClause = this.buildGroupByClause(
      appliedDimensions,
      !!query.timeDimension,
    );

    // Process and validate orderBy fields
    const processedOrderBy = this.validateAndProcessOrderBy(
      query.orderBy,
      appliedDimensions,
      appliedMetrics,
      !!query.timeDimension,
    );

    // Build ORDER BY clause
    const orderByClause = this.buildOrderByClause(processedOrderBy);

    // Build WITH FILL clause for time dimension to fill gaps in timeseries
    const withFillClause = this.buildWithFillClause(
      query.timeDimension,
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
        query,
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
        query,
        view,
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
        !!query.timeDimension,
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
