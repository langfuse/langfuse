import type { WidgetExportSource } from "@/src/features/widgets";

/**
 * Which name lookup turns the first dimension's IDs into readable labels.
 * `keyOwners` labels key IDs by who they attribute to, folding a user's keys
 * into one series.
 */
export type GatewayAnalyticsLabelSource = "apiKeys" | "keyOwners";

/** A saved dashboard widget's configuration plus its place on the page. */
export type GatewayAnalyticsWidget = WidgetExportSource & {
  id: string;
  dimensionLabels?: GatewayAnalyticsLabelSource;
  /**
   * Rows to fetch when labels fold several rows into one, so the top series
   * are complete. Defaults to the chart's row limit.
   */
  queryRowLimit?: number;
  size: "small" | "medium" | "full";
};
