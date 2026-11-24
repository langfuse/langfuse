import { type z } from "zod";
import { type ViewVersion } from "@langfuse/shared/query";
import { type PostUnstableDashboardWidgetResponse } from "@/src/features/public-api/types/unstable-dashboard-widgets";

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
  timeRangeLabel: string;
};
