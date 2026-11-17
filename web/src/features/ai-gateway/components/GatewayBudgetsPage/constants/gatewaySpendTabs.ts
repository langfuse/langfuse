import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/** Each tab lists spend per one key column; selecting a row filters the chart by that column. */
export const GATEWAY_SPEND_TABS = {
  users: { label: "Users", column: "aiGatewayKeyOwnerUserId" },
  apiKeys: { label: "API keys", column: "aiGatewayKeyId" },
} as const satisfies Record<
  GatewayAnalyticsLabelSource,
  { label: string; column: string }
>;

export type GatewaySpendTab = keyof typeof GATEWAY_SPEND_TABS;
