import { type z } from "zod/v4";
import { convertDateToClickhouseDateTime } from "@langfuse/shared/src/server";
import {
  type QueryType,
  type ViewDeclarationType,
  type views,
  query as queryModel,
  type metricAggregations,
  type granularities,
} from "../types";
import { viewDeclarations } from "@/src/features/query/dataModel";
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
};

type AppliedMetricType = {
  sql: string;
  aggregation: z.infer<typeof metricAggregations>;
  alias?: string;
  relationTable?: string;
};

export class QueryBuilder {
  private chartConfig?: { bins?: number; row_limit?: number };

  constructor(chartConfig?: { bins?: number; row_limit?: number }) {
    this.chartConfig = chartConfig;
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
    if (!(viewName in viewDeclarations)) {
      throw new InvalidRequestError(
        `Invalid view. Must be one of ${Object.keys(viewDeclarations)}`,
      );
    }
    return viewDeclarations[viewName];
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
      return { ...dim, table: dim.relationTable || view.name };
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
      };
    });
  }

  private mapFilters(
    filters: z.infer<typeof queryModel>["filters"],
    view: ViewDeclarationType,
  ) {
    // Transform our filters to match the column mapping format expected by createFilterFromFilterState
    const columnMappings = filters.map((filter) => {
      let clickhouseSelect: string;
      let queryPrefix: string = "";
      let clickhouseTableName: string = view.name;
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
    // Create column mappings for standard filters
    const projectIdMapping = {
      uiTableName: "project_id",
      uiTableId: "project_id",
      clickhouseTableName: view.name,
      clickhouseSelect: "project_id",
      queryPrefix: view.name,
      type: "string",
    };

    const timeDimensionMapping = {
      uiTableName: view.timeDimension,
      uiTableId: view.timeDimension,
      clickhouseTableName: view.name,
      clickhouseSelect: view.timeDimension,
      queryPrefix: view.name,
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
      if (filter.clickhouseTable !== view.name) {
        relationTables.add(filter.clickhouseTable);
      }
    });
    return relationTables;
  }

  private buildJoins(
    relationTables: Set<string>,
    view: ViewDeclarationType,
    filterList: FilterList,
    query: QueryType,
  ) {
    const relationJoins = [];
    for (const relationTableName of relationTables) {
      if (!(relationTableName in view.tableRelations)) {
        throw new InvalidRequestError(
          `Invalid relationTable: ${relationTableName}. Must be one of ${Object.keys(view.tableRelations)}`,
        );
      }

      const relation = view.tableRelations[relationTableName];
      let joinStatement = `LEFT JOIN ${relation.name} FINAL ${relation.joinConditionSql}`;

      // Create time dimension mapping for the relation table
      const relationTimeDimensionMapping = {
        uiTableName: relation.timeDimension,
        uiTableId: relation.timeDimension,
        clickhouseTableName: relation.name,
        clickhouseSelect: relation.timeDimension,
        queryPrefix: relation.name,
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

  private buildInnerDimensionsPart(
    appliedDimensions: AppliedDimensionType[],
    query: QueryType,
    view: ViewDeclarationType,
  ) {
    let dimensions = "";

    // Add regular dimensions
    if (appliedDimensions.length > 0) {
      dimensions += `${appliedDimensions
        .map(
          (dimension) =>
            `any(${dimension.sql}) as ${dimension.alias ?? dimension.sql}`,
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
        `${view.name}.${view.timeDimension}`,
        granularity,
      );
      dimensions += `any(${timeDimensionSql}) as time_dimension,`;
    }

    return dimensions;
  }

  private buildInnerMetricsPart(appliedMetrics: AppliedMetricType[]) {
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

  private buildOuterSelect(
    outerDimensionsPart: string,
    outerMetricsPart: string,
    innerQuery: string,
    groupByClause: string,
    orderByClause: string,
    withFillClause: string,
  ) {
    return `
      SELECT
        ${outerDimensionsPart}
        ${outerMetricsPart}
      FROM (${innerQuery})
      ${groupByClause}
      ${orderByClause}
      ${withFillClause}`;
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
   *      (...tableRelations.joinConditionSql)
   *      WHERE <...filters>
   *      GROUP BY <baseCte>.project_id, <baseCte>.id
   *   )
   *   GROUP BY <...dimensions>
   *   ORDER BY <fields with directions>
   * ```
   */
  public build(
    query: QueryType,
    projectId: string,
  ): { query: string; parameters: Record<string, unknown> } {
    // Run zod validation
    const parseResult = queryModel.safeParse(query);
    if (!parseResult.success) {
      throw new InvalidRequestError(
        `Invalid query: ${JSON.stringify(parseResult.error.issues)}`,
      );
    }

    // Initialize parameters object
    const parameters: Record<string, unknown> = {};

    // Get view declaration
    const view = this.getViewDeclaration(query.view);

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
      );
      fromClause += ` ${relationJoins.join(" ")}`;
    }

    // Build WHERE clause with parameters
    fromClause += this.buildWhereClause(filterList, parameters);

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

    // Build final query
    const sql = this.buildOuterSelect(
      outerDimensionsPart,
      outerMetricsPart,
      innerQuery,
      groupByClause,
      orderByClause,
      withFillClause,
    );

    return {
      query: sql,
      parameters,
    };
  }
}
