import { type z } from "zod";
import { type FilterState } from "@langfuse/shared";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type QueryType,
  type ViewVersion,
  type views,
  type QueryValidationResult,
} from "@langfuse/shared/query";

// ============================================================================
// Types
// ============================================================================

export interface WidgetMetricConfig {
  measure: string;
  agg: string;
}

export interface WidgetDimensionConfig {
  field: string;
}

export interface WidgetChartConfig {
  type: DashboardWidgetChartType;
  row_limit?: number;
  bins?: number;
  defaultSort?: {
    column: string;
    order: "ASC" | "DESC";
  };
}

/**
 * Widget configuration - the shape of data stored in DB or passed programmatically.
 */
export interface WidgetConfig {
  view: z.infer<typeof views>;
  dimensions: WidgetDimensionConfig[];
  metrics: WidgetMetricConfig[];
  filters: FilterState;
  chartType: DashboardWidgetChartType;
  chartConfig: WidgetChartConfig;
  /**
   * Minimum version required by this widget config.
   * When >= 2, forces v2 regardless of beta toggle.
   */
  minVersion?: number;
}

export interface UseWidgetQueryParams {
  widgetConfig: WidgetConfig;
  dateRange: { from: Date; to: Date } | undefined;
  /**
   * Additional filters from parent context (e.g., dashboard-level filters).
   * These are merged with widget filters.
   */
  filterState?: FilterState;
  /**
   * Sort state for pivot tables.
   */
  sortState?: { column: string; order: string } | null;
}

export interface UseWidgetQueryResult {
  query: QueryType;
  version: ViewVersion;
  validation: QueryValidationResult;
}
