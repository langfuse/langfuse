import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/** Grid placement per widget size, shared by the cards and their loading skeleton. */
export const GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES: Record<
  GatewayAnalyticsWidget["size"],
  string
> = {
  small: "h-40 lg:col-span-2",
  medium: "h-96 lg:col-span-3",
  full: "h-96 lg:col-span-6",
};
