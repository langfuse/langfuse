import { ClickhouseClientType } from "@langfuse/shared/src/server";
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
        return { ...view.dimensions[filter.field], ...filter };
      }
      if (filter.field in view.measures) {
        return { ...view.measures[filter.field], ...filter };
      }
      if (filter.field === view.timeDimension.sql) {
        return { ...view.timeDimension, ...filter };
      }
      throw new Error(
        `Invalid filter. Must be one of ${Object.keys(view.dimensions)} or ${Object.keys(view.measures)}`,
      );
    });
    appliedFilters.push({
      field: "project_id",
      operator: "eq",
      value: projectId,
      type: "string",
      sql: "project_id",
    });

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
      const validRelationTables = Object.keys(view.tableRelations).every(
        (relationTable) => relationTables.has(relationTable),
      );
      if (!validRelationTables) {
        throw new Error(
          `Invalid relationTable. Must be one of ${Object.keys(view.tableRelations)}`,
        );
      }
      const tableRelations = Array.from(relationTables).map(
        (relationTable) => view.tableRelations[relationTable],
      );
      sqlQuery += ` ${tableRelations.join(" ")}`;
    }

    // Create the where condition
    if (query.filters.length > 0) {
      // TODO: Prevent SQL injection by using templates here
      sqlQuery += ` WHERE ${appliedFilters.map((filter) => `${filter.sql} ${this.translateFilterOperator(filter.operator)} '${filter.value}'`).join(" AND\n")}`;
    }

    // Now on to the inner SELECT clause
    sqlQuery = `
      SELECT
        ${view.baseCte}.project_id,
        ${view.baseCte}.id,
        ${appliedDimensions.map((dimension) => `any(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`).join(",\n")},
        ${appliedMetrics.map((metric) => `${metric.sql} as ${metric.alias || metric.sql}`).join(",\n")}
        ${sqlQuery}
      GROUP BY ${view.baseCte}.project_id, ${view.baseCte}.id`;

    // With this, we can construct the outer select clause
    sqlQuery = `
      SELECT
        ${appliedDimensions.map((dimension) => `${dimension.alias ?? dimension.sql} as ${dimension.alias || dimension.sql}`).join(",\n")},
        ${appliedMetrics.map((metric) => `${this.translateAggregation(metric.aggregation)}(${metric.alias || metric.sql}) as ${metric.aggregation}_${metric.alias || metric.sql}`).join(",\n")}
      FROM (${sqlQuery})
      GROUP BY ${appliedDimensions.map((dimension) => dimension.alias ?? dimension.sql).join(",\n")}`;

    return sqlQuery;
  }
}
