import type { QueryType } from "@langfuse/shared/query";

import type { WidgetExportSource } from "@/src/features/widgets/utils/import-export-utils";

/** Which name lookup turns the first dimension's IDs into readable labels. */
export type GatewayAnalyticsLabelSource = "apiKeys" | "users";

/** A saved dashboard widget's configuration plus its place on the page. */
export type GatewayAnalyticsWidget = WidgetExportSource & {
  id: string;
  dimensionLabels?: GatewayAnalyticsLabelSource;
  size: "small" | "medium" | "full";
};

/** Time bucket of a time series widget; `auto` picks one from the time range. */
export type GatewayAnalyticsGranularity = NonNullable<
  QueryType["timeDimension"]
>["granularity"];
