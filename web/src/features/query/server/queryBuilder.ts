import {
  type ClickhouseClientType,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { type QueryType } from "./types";
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
  public build(query: QueryType, projectId: string): string {
    // Find the applicable view
    if (!(query.view in viewDeclarations)) {
      throw new Error(
        `Invalid view. Must be one of ${Object.keys(viewDeclarations)}`,
      );
    }
    const view = viewDeclarations[query.view];

    // Find the dimensions
    const appliedDimensions = query.dimensions.map((dimension) => {
      if (!(dimension.field in view.dimensions)) {
        throw new Error(
          `Invalid dimension. Must be one of ${Object.keys(view.dimensions)}`,
        );
      }
      return view.dimensions[dimension.field];
    });

    // Find the metrics
    const appliedMetrics = query.metrics.map((metric) => {
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

    // Find the filters
    const appliedFilters = query.filters.map((filter) => {
      if (filter.field in view.dimensions) {
        const dimension = view.dimensions[filter.field];
        return {
          ...filter,
          table: view.baseCte,
          sql: dimension.sql, // Use the SQL expression, not the alias
          type: dimension.type,
        };
      }
      if (filter.field in view.measures) {
        const measure = view.measures[filter.field];
        return {
          ...filter,
          table: view.baseCte,
          sql: measure.sql, // Use the SQL expression, not the alias
          type: measure.type,
        };
      }
      if (filter.field === view.timeDimension) {
        return {
          ...filter,
          table: view.baseCte,
          sql: view.timeDimension,
          type: "Date",
        };
      }
      throw new Error(
        `Invalid filter. Must be one of ${Object.keys(view.dimensions)} or ${Object.keys(view.measures)} or ${view.timeDimension}`,
      );
    });

    // Add project_id filter
    appliedFilters.push({
      field: "project_id",
      operator: "eq",
      table: view.baseCte,
      value: projectId,
      type: "string",
      sql: "project_id",
    });

    // Add fromTimestamp and toTimestamp filters if they exist
    if (query.fromTimestamp) {
      appliedFilters.push({
        field: view.timeDimension,
        operator: "gte",
        table: view.baseCte,
        value: convertDateToClickhouseDateTime(new Date(query.fromTimestamp)),
        type: "Date",
        sql: view.timeDimension,
      });
    }
    if (query.toTimestamp) {
      appliedFilters.push({
        field: view.timeDimension,
        operator: "lte",
        table: view.baseCte,
        value: convertDateToClickhouseDateTime(new Date(query.fromTimestamp)),
        type: "Date",
        sql: view.timeDimension,
      });
    }

    // Decide which base tables we're querying.
    let sqlQuery = `FROM ${view.baseCte}`;

    // Confirm whether there are any relationTable references
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

    // If there are relationTables, we need to join them
    if (relationTables.size > 0) {
      const relationJoins = [];
      for (const relationTableName of relationTables) {
        if (!(relationTableName in view.tableRelations)) {
          throw new Error(
            `Invalid relationTable: ${relationTableName}. Must be one of ${Object.keys(view.tableRelations)}`,
          );
        }

        const relation = view.tableRelations[relationTableName];
        let joinStatement = `LEFT JOIN ${relation.name} ${relation.joinCondition}`;

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

      sqlQuery += ` ${relationJoins.join(" ")}`;
    }

    // Create the where condition
    if (appliedFilters.length > 0) {
      sqlQuery += ` WHERE ${appliedFilters
        .map((filter) => {
          // Add quotes for string values, but not for numbers
          const valueStr =
            filter.type === "number" ? filter.value : `'${filter.value}'`;
          const columnRef = `${filter.table}.${filter.sql}`;
          // TODO: Prevent SQL injection by using templates here
          return `${columnRef} ${this.translateFilterOperator(filter.operator)} ${valueStr}`;
        })
        .join(" AND\n")}`;
    }

    // Generate the inner SELECT clause dimensions part
    const innerDimensionsPart =
      appliedDimensions.length > 0
        ? `${appliedDimensions.map((dimension) => `any(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`).join(",\n")},`
        : "";

    // Generate the inner SELECT clause metrics part
    const innerMetricsPart =
      appliedMetrics.length > 0
        ? `${appliedMetrics.map((metric) => `${metric.sql} as ${metric.alias || metric.sql}`).join(",\n")}`
        : "count(*) as count";

    // Now on to the inner SELECT clause
    sqlQuery = `
      SELECT
        ${view.baseCte}.project_id,
        ${view.baseCte}.id,
        ${innerDimensionsPart}
        ${innerMetricsPart}
        ${sqlQuery}
      GROUP BY ${view.baseCte}.project_id, ${view.baseCte}.id`;

    // Generate the outer SELECT clause dimensions part
    const outerDimensionsPart =
      appliedDimensions.length > 0
        ? `${appliedDimensions.map((dimension) => `${dimension.alias ?? dimension.sql} as ${dimension.alias || dimension.sql}`).join(",\n")},`
        : "";

    // Generate the outer SELECT clause metrics part
    const outerMetricsPart =
      appliedMetrics.length > 0
        ? `${appliedMetrics.map((metric) => `${this.translateAggregation(metric.aggregation)}(${metric.alias || metric.sql}) as ${metric.aggregation}_${metric.alias || metric.sql}`).join(",\n")}`
        : "count(*) as count";

    // Generate the GROUP BY clause
    const groupByClause =
      appliedDimensions.length > 0
        ? `GROUP BY ${appliedDimensions.map((dimension) => dimension.alias ?? dimension.sql).join(",\n")}`
        : "";

    // With this, we can construct the outer select clause
    sqlQuery = `
      SELECT
        ${outerDimensionsPart}
        ${outerMetricsPart}
      FROM (${sqlQuery})
      ${groupByClause}`;

    return sqlQuery;
  }
}
