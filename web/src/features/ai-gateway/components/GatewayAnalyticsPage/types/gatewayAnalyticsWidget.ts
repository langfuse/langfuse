import type { FilterCondition } from "@langfuse/shared";
import type { WidgetChartConfig } from "@/src/features/widgets";

/** Which name lookup turns the first dimension's IDs into readable labels. */
export type GatewayAnalyticsLabelSource = "apiKeys" | "users";

/**
 * A fixed analytics widget. The fields mirror a saved dashboard widget, so a
 * custom widget can be rendered by the same card once it is stored.
 */
export type GatewayAnalyticsWidget = {
  id: string;
  name: string;
  description: string;
  view: "observations";
  dimensions: { field: string }[];
  metrics: { measure: string; agg: string }[];
  filters: FilterCondition[];
  chartConfig: WidgetChartConfig;
  dimensionLabels?: GatewayAnalyticsLabelSource;
  size: "small" | "medium" | "full";
};
