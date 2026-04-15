import { type QueryType, type ViewVersion } from "@/src/features/query/types";
import { getViewDeclaration } from "@/src/features/query/dataModel";

/**
 * Result of query validation.
 * Either valid (query is safe to run) or invalid with a reason.
 */
export type QueryValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Gets the list of high cardinality dimension fields used in the query.
 *
 * @param query - The query configuration
 * @param version - The view version (v1 or v2)
 * @returns Array of high cardinality field names
 */
function getHighCardinalityDimensions(
  query: QueryType,
  version: ViewVersion,
): string[] {
  if (!query.dimensions || query.dimensions.length === 0) {
    return [];
  }

  const view = getViewDeclaration(query.view, version);
  return query.dimensions
    .filter((dim) => view.dimensions[dim.field]?.highCardinality)
    .map((dim) => dim.field);
}

/**
 * Finds the measure name that matches an orderBy field.
 * OrderBy fields can be:
 * - "{aggregation}_{measureName}" like "sum_totalCost" or "count_count"
 * - Just the measure name like "totalCost"
 * We search for known measure names as suffixes of the orderBy field.
 *
 * @param orderByField - The orderBy field string
 * @param knownMeasures - List of known measure names from the query
 * @returns The matching measure name, or null if no match found
 */
function findMeasureInOrderByField(
  orderByField: string,
  knownMeasures: string[],
): string | null {
  for (const measure of knownMeasures) {
    // Check exact match (e.g., orderBy: "totalCost" matches measure "totalCost")
    if (orderByField === measure) {
      return measure;
    }
    // Check suffix match (e.g., orderBy: "sum_totalCost" matches measure "totalCost")
    if (orderByField.endsWith(`_${measure}`)) {
      return measure;
    }
  }
  return null;
}

/**
 * Validates a query for safety before execution.
 * Performs sanity checks for high cardinality dimension validation.
 *
 * High cardinality dimensions (id, traceId, userId, sessionId, etc.) are only allowed when:
 * 1. timeDimension is NOT set (timeseries with high cardinality produces unbounded results)
 * 2. config.row_limit (or chartConfig.row_limit) is explicitly specified (LIMIT)
 * 3. orderBy with direction 'desc' on a measure field is specified (for top-N queries)
 *
 * @param query - The query configuration (with original config, before defaults applied)
 * @param version - The view version (v1 or v2)
 * @returns Validation result: { valid: true } or { valid: false, reason: string }
 */
export function validateQuery(
  query: QueryType,
  version: ViewVersion,
): QueryValidationResult {
  // Only enforce validation for v2 queries
  if (version !== "v2") {
    return { valid: true };
  }

  // 1. Check for high cardinality dimensions
  const highCardDims = getHighCardinalityDimensions(query, version);

  if (highCardDims.length === 0) {
    return { valid: true };
  }

  // 2. Reject high cardinality dimensions in timeseries queries
  // A timeseries grouped by e.g. traceId produces unbounded rows (one per ID per time bucket)
  // and cannot be meaningfully limited with row_limit.
  if (query.timeDimension) {
    return {
      valid: false,
      reason: `High cardinality dimension(s) '${highCardDims.join(", ")}' cannot be used with timeDimension. Time series queries with high cardinality dimensions produce unbounded result sets.`,
    };
  }

  // 3. Validate required conditions for high cardinality
  // Support both public API "config" and internal "chartConfig" field names
  const chartConfig =
    (query as unknown as { config?: QueryType["chartConfig"] }).config ??
    query.chartConfig;
  const hasExplicitLimit = chartConfig?.row_limit !== undefined;

  // 4. Validate ORDER BY - must have at least one desc on a measure field
  const orderByDescFields =
    query.orderBy?.filter((o) => o.direction === "desc") ?? [];

  if (!hasExplicitLimit || orderByDescFields.length === 0) {
    return {
      valid: false,
      reason: `High cardinality dimension(s) '${highCardDims.join(", ")}' require both 'config.row_limit' and 'orderBy' with direction 'desc' on a measure field.`,
    };
  }

  // Extract measure names from orderBy fields and validate they are measures in the query
  const queryMeasureNames = query.metrics.map((m) => m.measure);
  const invalidOrderByFields: string[] = [];

  for (const orderBy of orderByDescFields) {
    const matchedMeasure = findMeasureInOrderByField(
      orderBy.field,
      queryMeasureNames,
    );
    if (!matchedMeasure) {
      invalidOrderByFields.push(orderBy.field);
    }
  }

  if (invalidOrderByFields.length > 0) {
    return {
      valid: false,
      reason:
        `High cardinality dimension(s) '${highCardDims.join(", ")}' require 'orderBy' with direction 'desc' on a measure field. ` +
        `'${invalidOrderByFields.join(", ")}' ${invalidOrderByFields.length === 1 ? "is" : "are"} not a measure in this query.`,
    };
  }

  return { valid: true };
}

/**
 * Extracts only query-engine fields from a widget's persisted chartConfig.
 * Strips rendering-only fields (defaultSort, show_value_labels, etc.)
 * that are only used by Chart components.
 *
 * Accepts any object with at least `type: string` — the discriminated union
 * from ChartConfigSchema satisfies this via tRPC inference.
 */
export function toQueryChartConfig<
  T extends { type: string; bins?: number; row_limit?: number },
>(
  widgetChartConfig: T,
  options?: { defaultRowLimit?: number },
): NonNullable<QueryType["chartConfig"]> {
  const rowLimit = widgetChartConfig.row_limit ?? options?.defaultRowLimit;
  return {
    type: widgetChartConfig.type,
    ...(widgetChartConfig.bins !== undefined && {
      bins: widgetChartConfig.bins,
    }),
    ...(rowLimit !== undefined && { row_limit: rowLimit }),
  };
}

/**
 * Checks if a non-timeseries chart with a dimension on v2 needs top-N
 * enforcement (orderBy desc + row_limit).
 */
export function isV2BreakdownChart(params: {
  version: ViewVersion;
  hasDimension: boolean;
  isTimeSeries: boolean;
  chartType: string;
}): boolean {
  return (
    params.version === "v2" &&
    params.hasDimension &&
    !params.isTimeSeries &&
    params.chartType !== "HISTOGRAM" &&
    params.chartType !== "PIVOT_TABLE"
  );
}

/**
 * Builds the orderBy clause for a widget query.
 * - PIVOT_TABLE: uses the provided sort state
 * - v2 breakdown charts: auto-sorts desc on the first metric for top-N
 * - Otherwise: null
 */
export function buildWidgetOrderBy(params: {
  chartType: string;
  sortState: { column: string; order: string } | null;
  needsTopN: boolean;
  firstMetric: { aggregation: string; measure: string } | undefined;
}): QueryType["orderBy"] {
  if (params.chartType === "PIVOT_TABLE" && params.sortState) {
    return [
      {
        field: params.sortState.column,
        direction: params.sortState.order.toLowerCase() as "asc" | "desc",
      },
    ];
  }
  if (params.needsTopN && params.firstMetric) {
    return [
      {
        field: `${params.firstMetric.aggregation}_${params.firstMetric.measure}`,
        direction: "desc",
      },
    ];
  }
  return null;
}
