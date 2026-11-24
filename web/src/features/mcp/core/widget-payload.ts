import { type z } from "zod";
import { type ViewVersion } from "@langfuse/shared/query";
import { type PostUnstableDashboardWidgetResponse } from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { type WidgetTimeRange } from "./widget-time-ranges";

/**
 * The MCP App tool behind the widget view. The view calls it again, through
 * the host, to refresh the chart or change its time range.
 */
export const RENDER_WIDGET_TOOL_NAME = "renderWidget";

/**
 * What `renderWidget` charts: a dashboard widget's definition as the public
 * API returns it, without its record fields. Filters stay on the server.
 */
export type WidgetDefinition = Omit<
  z.infer<typeof PostUnstableDashboardWidgetResponse>,
  "id" | "createdAt" | "updatedAt" | "filters"
>;

/**
 * A widget definition with its query rows: what `renderWidget` sends in the
 * result's `_meta.widget` and the MCP App view renders.
 */
export type WidgetPayload = WidgetDefinition & {
  version: ViewVersion;
  rows: Record<string, unknown>[];
  /** The time window as requested. */
  timeRange: WidgetTimeRange;
  /** The range actually queried, e.g. shortened to the plan's data access. */
  timeRangeLabel: string;
  /** The earliest time the plan's data access allows, when it limits it. */
  earliestTimestamp?: string;
};
