import type { WidgetExportSource } from "@/src/features/widgets";

/**
 * Which name lookup turns the first dimension's IDs into readable labels.
 * `attribution` covers both user IDs and key IDs.
 */
export type GatewayAnalyticsLabelSource = "apiKeys" | "attribution";

/** A saved dashboard widget's configuration plus its place on the page. */
export type GatewayAnalyticsWidget = WidgetExportSource & {
  id: string;
  dimensionLabels?: GatewayAnalyticsLabelSource;
  size: "small" | "medium" | "full";
};
