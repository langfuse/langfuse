import type { FieldCatalog } from "../field-catalog/types";
import type {
  RollupConfig,
  AggregateConfig,
  BuildResult,
  OrderByConfig,
} from "./types";
import { translateAggregation } from "../clickhouse-sql/aggregation-functions";
import { FilterList } from "../clickhouse-sql/clickhouse-filter";
import { eventsTracesAggregation } from "../clickhouse-sql/query-fragments";

type GeneratedCTE = {
  name: string;
  sql: string;
  joinOn?: {
    left: string; // e.g., 'e.trace_id'
    right: string; // e.g., 't.trace_id'
  };
};

/**
 * Base query builder with shared logic (filters, ordering, limits)
 */
abstract class BaseQueryBuilder {
  protected projectId: string;
  protected catalog: FieldCatalog;
  protected filterList: FilterList = new FilterList();
  protected orderByConfig?: OrderByConfig;
  protected limitValue?: number;

  constructor(projectId: string, catalog: FieldCatalog) {
    this.projectId = projectId;
    this.catalog = catalog;
  }

  /**
   * Add filters using FilterList (additive - can be called multiple times)
   */
  where(filters: FilterList): this {
    // Additive: iterate through incoming filters and add them
    filters.forEach((filter) => {
      this.filterList.push(filter);
    });
    return this;
  }

  /*
   * Add ordering
   */
  orderBy(field: string, direction: "asc" | "desc" = "desc"): this {
    this.orderByConfig = { field, direction };
    return this;
  }

  /**
   * Set limit
   */
  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  /**
   * Build the query - implemented by subclasses
   */
  abstract buildQuery(): BuildResult;

  // Shared helper methods

  protected applyFiltersToQuery(): {
    whereClause: string;
    params: Record<string, unknown>;
  } {
    let whereClause = "WHERE e.project_id = {projectId: String}";
    const params: Record<string, unknown> = {};

    if (this.filterList.length() > 0) {
      const { query: filterSQL, params: filterParams } =
        this.filterList.apply();
      Object.assign(params, filterParams);
      whereClause += `\n  AND ${filterSQL}`;
    }

    return { whereClause, params };
  }

  protected buildOrderByClause(): string {
    if (!this.orderByConfig) return "";
    const orderByField = this.resolveOrderByField(this.orderByConfig.field);
    return `ORDER BY ${orderByField} ${this.orderByConfig.direction.toUpperCase()}`;
  }

  protected buildLimitClause(): string {
    if (this.limitValue === undefined) return "";
    let limitClause = `LIMIT ${this.limitValue}`;
    return limitClause;
  }

  protected resolveOrderByField(fieldName: string): string {
    const entry = this.catalog[fieldName];
    if (entry && entry.kind === "field" && entry.source.table === "events") {
      return entry.source.sql;
    }
    return fieldName;
  }

  protected generateMeasureSQL(
    measures: Array<{ measure: string; aggregation: any; alias?: string }>,
    // eslint-disable-next-line no-unused-vars
    aliasFormatter: (m: {
      measure: string;
      aggregation: any;
      alias?: string;
    }) => string,
  ): string[] {
    return measures.map((m) => {
      const entry = this.catalog[m.measure];
      if (!entry || entry.kind !== "measure") {
        throw new Error(`Invalid measure: ${m.measure}`);
      }
      const aggregatedSQL = translateAggregation(
        entry.source.sql,
        m.aggregation,
      );
      const alias = m.alias || aliasFormatter(m);
      return `${aggregatedSQL} as ${alias}`;
    });
  }

  protected getDimensionsSQLForGroupBy(dimensions: string[]): string {
    return dimensions
      .map((dim) => {
        const entry = this.catalog[dim];
        return entry!.source.sql;
      })
      .join(", ");
  }

  protected validateDimensions(dimensions: string[]): void {
    for (const dim of dimensions) {
      const entry = this.catalog[dim];
      if (!entry || entry.kind !== "field") {
        throw new Error(`Invalid dimension: ${dim}`);
      }
      if (entry.groupable === false) {
        throw new Error(`Field ${dim} is not groupable`);
      }
    }
  }

  protected validateMeasures(
    measures: Array<{ measure: string; aggregation: any }>,
  ): void {
    for (const measure of measures) {
      const entry = this.catalog[measure.measure];
      if (!entry || entry.kind !== "measure") {
        throw new Error(`Invalid measure: ${measure.measure}`);
      }
      if (!entry.allowedAggregations.includes(measure.aggregation)) {
        throw new Error(
          `Aggregation ${measure.aggregation} not allowed for measure ${measure.measure}`,
        );
      }
    }
  }
}

/**
 * Builder for row-level SELECT queries with optional rollups
 */
export class SelectQueryBuilder extends BaseQueryBuilder {
  private selectedFields: string[];
  private rollups: RollupConfig[] = [];
  private needsTracesCTE = false;

  constructor(projectId: string, catalog: FieldCatalog, fields: string[]) {
    super(projectId, catalog);
    this.validateFields(fields);
    this.selectedFields = fields;
  }

  protected validateFields(fields: string[]): void {
    for (const field of fields) {
      if (!this.catalog[field]) {
        throw new Error(`Unknown field: ${field}`);
      }
      const entry = this.catalog[field];
      if (entry.kind !== "field") {
        throw new Error(`${field} is a measure, not a field`);
      }
    }
  }

  /**
   * Add a rollup - enriches observation rows with aggregation context
   */
  withRollup(rollup: RollupConfig): this {
    this.validateDimensions(rollup.dimensions);
    this.validateMeasures(rollup.measures);
    this.rollups.push(rollup);
    return this;
  }

  buildQuery(): BuildResult {
    this.analyzeDependencies();

    const ctes: GeneratedCTE[] = [];

    if (this.needsTracesCTE) {
      ctes.push(this.generateTracesCTE());
    }

    if (this.rollups.length > 0) {
      ctes.push(...this.generateRollupCTEs());
    }

    const { mainQuery, params: selectParams } = this.generateSelectQuery(ctes);
    const params = {
      projectId: this.projectId,
      ...selectParams,
    };

    let query = "";
    if (ctes.length > 0) {
      const cteSQL = ctes
        .map((cte) => `${cte.name} AS (\n${cte.sql}\n)`)
        .join(",\n");
      query = `WITH ${cteSQL}\n${mainQuery}`;
    } else {
      query = mainQuery;
    }

    return { query, params };
  }

  private analyzeDependencies(): void {
    for (const fieldName of this.selectedFields) {
      const entry = this.catalog[fieldName];
      if (entry && entry.source.table === "traces") {
        this.needsTracesCTE = true;
        break;
      }
    }
  }

  private generateTracesCTE(): GeneratedCTE {
    const { query, params: _ } = eventsTracesAggregation({
      projectId: this.projectId,
    }).buildWithParams();

    return {
      name: "traces",
      sql: query,
      joinOn: {
        left: "e.trace_id",
        right: "t.id", // eventsTracesAggregation returns trace_id AS id
      },
    };
  }

  private generateRollupCTEs(): GeneratedCTE[] {
    const ctes: GeneratedCTE[] = [];

    for (let i = 0; i < this.rollups.length; i++) {
      const rollup = this.rollups[i];
      const cteName = `rollup_${i}`;

      const dimensionSQL = this.getDimensionsSQLForGroupBy(rollup.dimensions);
      const measureSQLArray = this.generateMeasureSQL(
        rollup.measures,
        (m) =>
          m.alias ||
          this.generateRollupColumnName(
            rollup.dimensions,
            m.measure,
            m.aggregation,
          ),
      );

      const sql = `
      SELECT
	    ${dimensionSQL},
	    ${measureSQLArray.join(", ")}
		  FROM events e
		  WHERE e.project_id = {projectId: String}
		  GROUP BY ${dimensionSQL}`;

      const joinConditions = rollup.dimensions.map((dim) => {
        const entry = this.catalog[dim];
        return `e.${entry!.alias} = ${cteName}.${entry!.alias}`;
      });

      ctes.push({
        name: cteName,
        sql,
        joinOn: {
          left: joinConditions[0].split(" = ")[0],
          right: joinConditions[0].split(" = ")[1],
        },
      });
    }

    return ctes;
  }

  private generateRollupColumnName(
    dimensions: string[],
    measure: string,
    aggregation: string,
  ): string {
    return `${dimensions.join("_")}_${measure}_${aggregation}`;
  }

  private generateSelectQuery(ctes: GeneratedCTE[]): {
    mainQuery: string;
    params: Record<string, unknown>;
  } {
    const selectFields: string[] = [];

    // Add selected fields
    for (const fieldName of this.selectedFields) {
      const entry = this.catalog[fieldName];
      if (!entry || entry.kind !== "field") {
        throw new Error(`Invalid field for select: ${fieldName}`);
      }

      if (entry.source.table === "events") {
        selectFields.push(`${entry.source.sql} as ${fieldName}`);
      } else if (entry.source.table === "traces") {
        selectFields.push(`t.${entry.alias} as ${fieldName}`);
      }
    }

    // Add rollup columns
    for (let i = 0; i < this.rollups.length; i++) {
      const rollup = this.rollups[i];
      const cteName = `rollup_${i}`;

      for (const measure of rollup.measures) {
        const columnName =
          measure.alias ||
          this.generateRollupColumnName(
            rollup.dimensions,
            measure.measure,
            measure.aggregation,
          );
        selectFields.push(`${cteName}.${columnName}`);
      }
    }

    // Build FROM clause with joins
    let fromClause = "FROM events e";

    if (this.needsTracesCTE) {
      const tracesCTE = ctes.find((c) => c.name === "traces");
      if (tracesCTE?.joinOn) {
        fromClause += `\nLEFT JOIN traces t ON ${tracesCTE.joinOn.left} = ${tracesCTE.joinOn.right}`;
      }
    }

    for (let i = 0; i < this.rollups.length; i++) {
      const rollup = this.rollups[i];
      const cteName = `rollup_${i}`;

      const joinConditions = rollup.dimensions.map((dim) => {
        const entry = this.catalog[dim];
        return `e.${entry!.alias} = ${cteName}.${entry!.alias}`;
      });

      fromClause += `\nLEFT JOIN ${cteName} ON ${joinConditions.join(" AND ")}`;
    }

    const { whereClause, params: filterParams } = this.applyFiltersToQuery();
    const orderByClause = this.buildOrderByClause();
    const limitClause = this.buildLimitClause();

    const mainQuery = `SELECT
		  ${selectFields.join(",\n  ")}
			${fromClause}
			${whereClause}
			${orderByClause}
			${limitClause}`.trim();

    return { mainQuery, params: filterParams };
  }
}

/**
 * Builder for aggregation queries (GROUP BY with measures)
 */
export class AggregateQueryBuilder extends BaseQueryBuilder {
  private aggregateConfig: AggregateConfig;

  constructor(
    projectId: string,
    catalog: FieldCatalog,
    config: AggregateConfig,
  ) {
    super(projectId, catalog);
    this.validateDimensions(config.dimensions);
    this.validateMeasures(config.measures);
    this.aggregateConfig = config;
  }

  protected generateDimensionSQL(dimensions: string[]): string[] {
    return dimensions.map((dim) => {
      const entry = this.catalog[dim];
      if (!entry || entry.kind !== "field") {
        throw new Error(`Invalid dimension: ${dim}`);
      }
      return `${entry.source.sql} as ${dim}`;
    });
  }

  buildQuery(): BuildResult {
    const { measures, dimensions } = this.aggregateConfig;

    const dimensionFields = this.generateDimensionSQL(dimensions);
    const measureFields = this.generateMeasureSQL(
      measures,
      (m) => `${m.measure}_${m.aggregation}`,
    );
    const groupByFields = this.getDimensionsSQLForGroupBy(dimensions);

    const { whereClause, params: filterParams } = this.applyFiltersToQuery();
    const params: Record<string, unknown> = {
      projectId: this.projectId,
      ...filterParams,
    };

    const orderByClause = this.buildOrderByClause();
    const limitClause = this.buildLimitClause();

    const query = `SELECT
	  ${[...dimensionFields, ...measureFields].join(",\n  ")}
		FROM events e
		${whereClause}
		GROUP BY ${groupByFields}
		${orderByClause}
		${limitClause}`.trim();

    return { query, params };
  }
}
