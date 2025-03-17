import { type z } from "zod";
import {
  type ClickhouseClientType,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { type QueryType, type ViewDeclarationType, type views } from "./types";
import { viewDeclarations } from "@/src/features/query/server/dataModel";

export class QueryBuilder {
  constructor(private clickhouseClient: ClickhouseClientType) {}

  private translateAggregation(aggregation: string): string {
    switch (aggregation) {
      case "sum":
        return "sum";
      case "avg":
        return "avg";
      case "count":
        return "count";
      case "max":
        return "max";
      case "min":
        return "min";
      case "p50":
        return "quantile(0.5)";
      case "p75":
        return "quantile(0.75)";
      case "p90":
        return "quantile(0.9)";
      case "p95":
        return "quantile(0.95)";
      case "p99":
        return "quantile(0.99)";
      default:
        throw new Error(`Invalid aggregation: ${aggregation}`);
    }
  }

  private translateFilterOperator(operator: string): string {
    switch (operator) {
      case "eq":
        return "=";
      case "ne":
        return "!=";
      case "lt":
        return "<";
      case "lte":
        return "<=";
      case "gt":
        return ">";
      case "gte":
        return ">=";
      case "in":
        return "IN";
      case "not_in":
        return "NOT IN";
      case "like":
        return "LIKE";
      case "not_like":
        return "NOT LIKE";
      case "has_any":
        return "HAS ANY";
      case "has_all":
        return "HAS ALL";
      default:
        throw new Error(`Invalid filter operator: ${operator}`);
    }
  }

  private getViewDeclaration(
    viewName: z.infer<typeof views>,
  ): ViewDeclarationType {
    if (!(viewName in viewDeclarations)) {
      throw new Error(
        `Invalid view. Must be one of ${Object.keys(viewDeclarations)}`,
      );
    }
    return viewDeclarations[viewName];
  }

  private mapDimensions(
    dimensions: Array<{ field: string }>,
    view: ViewDeclarationType,
  ) {
    return dimensions.map((dimension) => {
      if (!(dimension.field in view.dimensions)) {
        throw new Error(
          `Invalid dimension. Must be one of ${Object.keys(view.dimensions)}`,
        );
      }
      const dim = view.dimensions[dimension.field];
      return { ...dim, table: dim.relationTable || view.name };
    });
  }

  private mapMetrics(
    metrics: Array<{ measure: string; aggregation: string }>,
    view: ViewDeclarationType,
  ) {
    return metrics.map((metric) => {
      if (!(metric.measure in view.measures)) {
        throw new Error(
          `Invalid metric. Must be one of ${Object.keys(view.measures)}`,
        );
      }
      return {
        ...view.measures[metric.measure],
        aggregation: metric.aggregation,
      };
    });
  }

  private mapFilters(
    filters: Array<{ field: string; operator: string; value: string }>,
    view: ViewDeclarationType,
  ) {
    return filters.map((filter) => {
      if (filter.field in view.dimensions) {
        const dimension = view.dimensions[filter.field];
        return {
          ...filter,
          table: view.name,
          sql: dimension.sql, // Use the SQL expression, not the alias
          type: dimension.type,
        };
      }
      if (filter.field in view.measures) {
        const measure = view.measures[filter.field];
        return {
          ...filter,
          table: view.name,
          sql: measure.sql, // Use the SQL expression, not the alias
          type: measure.type,
        };
      }
      if (filter.field === view.timeDimension) {
        return {
          ...filter,
          table: view.name,
          sql: view.timeDimension,
          type: "Date",
        };
      }
      throw new Error(
        `Invalid filter. Must be one of ${Object.keys(view.dimensions)} or ${Object.keys(view.measures)} or ${view.timeDimension}`,
      );
    });
  }

  private addStandardFilters(
    appliedFilters: any[],
    view: ViewDeclarationType,
    projectId: string,
    fromTimestamp: string,
    toTimestamp: string,
  ) {
    // Add project_id filter
    appliedFilters.push({
      field: "project_id",
      operator: "eq",
      table: view.name,
      value: projectId,
      type: "string",
      sql: "project_id",
    });

    // Add fromTimestamp and toTimestamp filters if they exist
    appliedFilters.push({
      field: view.timeDimension,
      operator: "gte",
      table: view.name,
      value: convertDateToClickhouseDateTime(new Date(fromTimestamp)),
      type: "Date",
      sql: view.timeDimension,
    });

    appliedFilters.push({
      field: view.timeDimension,
      operator: "lte",
      table: view.name,
      value: convertDateToClickhouseDateTime(new Date(toTimestamp)),
      type: "Date",
      sql: view.timeDimension,
    });

    view.segments.forEach((segment) => {
      appliedFilters.push({
        ...segment,
        table: view.name,
        sql: segment.field,
      });
    });

    return appliedFilters;
  }

  private collectRelationTables(
    appliedDimensions: any[],
    appliedMetrics: any[],
  ) {
    const relationTables = new Set<string>();
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

  private buildJoins(
    relationTables: Set<string>,
    view: ViewDeclarationType,
    appliedFilters: any[],
    query: QueryType,
  ) {
    const relationJoins = [];
    for (const relationTableName of relationTables) {
      if (!(relationTableName in view.tableRelations)) {
        throw new Error(
          `Invalid relationTable: ${relationTableName}. Must be one of ${Object.keys(view.tableRelations)}`,
        );
      }

      const relation = view.tableRelations[relationTableName];
      let joinStatement = `LEFT JOIN ${relation.name} FINAL ${relation.joinCondition}`;

      // Add relation-specific timestamp filters if applicable
      appliedFilters.push({
        field: relation.timeDimension,
        operator: "gte",
        table: relation.name,
        value: convertDateToClickhouseDateTime(new Date(query.fromTimestamp)),
        type: "Date",
        sql: relation.timeDimension,
      });
      appliedFilters.push({
        field: relation.timeDimension,
        operator: "lte",
        table: relation.name,
        value: convertDateToClickhouseDateTime(new Date(query.toTimestamp)),
        type: "Date",
        sql: relation.timeDimension,
      });

      relationJoins.push(joinStatement);
    }
    return relationJoins;
  }

  private buildWhereClause(
    appliedFilters: any[],
    parameters: Record<string, unknown>,
  ) {
    if (appliedFilters.length === 0) return "";

    // Create a counter for each field to ensure unique parameter names
    const fieldCounters: Record<string, number> = {};

    return ` WHERE ${appliedFilters
      .map((filter) => {
        const columnRef = `${filter.table}.${filter.sql}`;

        // Create a deterministic parameter name using the field name and a counter
        if (!fieldCounters[filter.field]) {
          fieldCounters[filter.field] = 1;
        } else {
          fieldCounters[filter.field]++;
        }

        const paramName = `filter_${filter.field}_${fieldCounters[filter.field]}`;

        // Set parameter value
        parameters[paramName] = filter.value;

        // Use parameterized value based on type
        let paramType: string;
        switch (filter.type) {
          case "number":
            paramType = "Decimal64(5)";
            break;
          case "Date":
            paramType = "DateTime64(3)";
            break;
          case "string":
          default:
            paramType = "String";
            break;
        }

        return `${columnRef} ${this.translateFilterOperator(filter.operator)} {${paramName}: ${paramType}}`;
      })
      .join(" AND\n")}`;
  }

  private determineTimeGranularity(
    fromTimestamp: string,
    toTimestamp: string,
  ): string {
    const from = new Date(fromTimestamp);
    const to = new Date(toTimestamp);
    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Choose appropriate granularity based on date range to get ~50 buckets
    if (diffDays < 1) {
      return "minute"; // Less than a day, use minutes
    } else if (diffDays < 3) {
      return "hour"; // 1-3 days, use hours
    } else if (diffDays < 60) {
      return "day"; // 3-60 days, use days
    } else if (diffDays < 365) {
      return "week"; // 2-12 months, use weeks
    } else {
      return "month"; // Over a year, use months
    }
  }

  private getTimeDimensionSql(
    table: string,
    timeDimension: string,
    granularity: string,
  ): string {
    switch (granularity) {
      case "minute":
        return `toStartOfMinute(${table}.${timeDimension})`;
      case "hour":
        return `toStartOfHour(${table}.${timeDimension})`;
      case "day":
        return `toDate(${table}.${timeDimension})`;
      case "week":
        return `toMonday(${table}.${timeDimension})`;
      case "month":
        return `toStartOfMonth(${table}.${timeDimension})`;
      default:
        return timeDimension;
    }
  }

  private buildInnerDimensionsPart(
    appliedDimensions: any[],
    query: QueryType,
    view: ViewDeclarationType,
  ) {
    let dimensions = "";

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions += `${appliedDimensions
        .map(
          (dimension) =>
            `any(${dimension.table}.${dimension.sql}) as ${dimension.alias ?? dimension.sql}`,
        )
        .join(",\n")},`;
    }

    // Add time dimension if specified
    if (query.timeDimension) {
      const granularity =
        query.timeDimension.granularity === "auto"
          ? this.determineTimeGranularity(
              query.fromTimestamp,
              query.toTimestamp,
            )
          : query.timeDimension.granularity;

      const timeDimensionSql = this.getTimeDimensionSql(
        view.name,
        view.timeDimension,
        granularity,
      );
      dimensions += `any(${timeDimensionSql}) as time_dimension,`;
    }

    return dimensions;
  }

  private buildInnerMetricsPart(appliedMetrics: any[]) {
    return appliedMetrics.length > 0
      ? `${appliedMetrics.map((metric) => `${metric.sql} as ${metric.alias || metric.sql}`).join(",\n")}`
      : "count(*) as count";
  }

  private buildInnerSelect(
    view: ViewDeclarationType,
    innerDimensionsPart: string,
    innerMetricsPart: string,
    fromClause: string,
  ) {
    return `
      SELECT
        ${view.name}.project_id,
        ${view.name}.id,
        ${innerDimensionsPart}
        ${innerMetricsPart}
        ${fromClause}
      GROUP BY ${view.name}.project_id, ${view.name}.id`;
  }

  private buildOuterDimensionsPart(
    appliedDimensions: any[],
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

  private buildOuterMetricsPart(appliedMetrics: any[]) {
    return appliedMetrics.length > 0
      ? `${appliedMetrics.map((metric) => `${this.translateAggregation(metric.aggregation)}(${metric.alias || metric.sql}) as ${metric.aggregation}_${metric.alias || metric.sql}`).join(",\n")}`
      : "count(*) as count";
  }

  private buildGroupByClause(
    appliedDimensions: any[],
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

  private buildOuterSelect(
    outerDimensionsPart: string,
    outerMetricsPart: string,
    innerQuery: string,
    groupByClause: string,
  ) {
    return `
      SELECT
        ${outerDimensionsPart}
        ${outerMetricsPart}
      FROM (${innerQuery})
      ${groupByClause}`;
  }

  /**
   * We want to build a ClickHouse query based on the query provided and the viewDeclaration that was selected.
   * The final query should always follow this pattern:
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
   *      (...tableRelations.joinCondition)
   *      WHERE <...filters>
   *      GROUP BY <baseCte>.project_id, <baseCte>.id
   *   )
   *   GROUP BY <...dimensions>
   * ```
   * For the initial setup, we ignore sorting and pagination.
   */
  public build(
    query: QueryType,
    projectId: string,
  ): { query: string; parameters: Record<string, unknown> } {
    // Initialize parameters object
    const parameters: Record<string, unknown> = {};

    // Get view declaration
    const view = this.getViewDeclaration(query.view);

    // Map dimensions, metrics, and filters
    const appliedDimensions = this.mapDimensions(query.dimensions, view);
    const appliedMetrics = this.mapMetrics(query.metrics, view);
    let appliedFilters = this.mapFilters(query.filters, view);

    // Add standard filters (project_id, timestamps)
    appliedFilters = this.addStandardFilters(
      appliedFilters,
      view,
      projectId,
      query.fromTimestamp,
      query.toTimestamp,
    );

    // Build the FROM clause with necessary JOINs
    let fromClause = `FROM ${view.baseCte}`;

    // Handle relation tables
    const relationTables = this.collectRelationTables(
      appliedDimensions,
      appliedMetrics,
    );
    if (relationTables.size > 0) {
      const relationJoins = this.buildJoins(
        relationTables,
        view,
        appliedFilters,
        query,
      );
      fromClause += ` ${relationJoins.join(" ")}`;
    }

    // Build WHERE clause with parameters
    fromClause += this.buildWhereClause(appliedFilters, parameters);

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
    );

    // Build outer SELECT parts
    const outerDimensionsPart = this.buildOuterDimensionsPart(
      appliedDimensions,
      !!query.timeDimension,
    );
    const outerMetricsPart = this.buildOuterMetricsPart(appliedMetrics);
    const groupByClause = this.buildGroupByClause(
      appliedDimensions,
      !!query.timeDimension,
    );

    // Build final query
    const sql = this.buildOuterSelect(
      outerDimensionsPart,
      outerMetricsPart,
      innerQuery,
      groupByClause,
    );

    return {
      query: sql,
      parameters,
    };
  }
}
