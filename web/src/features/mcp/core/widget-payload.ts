import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

/**
 * A widget definition with its query rows: what `renderWidget` sends in the
 * result's `_meta.widget` and the MCP App view renders.
 */
export type WidgetPayload = {
  title: string;
  description?: string;
  chartType: DashboardWidgetChartType;
  chartConfig: {
    type: DashboardWidgetChartType;
    row_limit?: number;
    bins?: number;
    defaultSort?: { column: string; order: "ASC" | "DESC" };
  };
  view: string;
  version: "v1" | "v2";
  metrics: { measure: string; agg: string }[];
  dimensions: { field: string }[];
  rows: Record<string, unknown>[];
  /** NUMBER widgets: the value, the previous period's value and a trend. */
  kpi?: {
    value: number | null;
    previousValue: number | null;
    trendRows: Record<string, unknown>[];
  };
  timeRangeLabel: string;
};
