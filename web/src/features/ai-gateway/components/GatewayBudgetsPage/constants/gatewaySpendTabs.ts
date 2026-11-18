import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import type { RouterInputs } from "@/src/utils/api";

/**
 * Each tab lists spend per one key column; selecting a row filters the chart by
 * that column. `subject` is what a budget on the tab caps, `scope` its server scope.
 */
export const GATEWAY_SPEND_TABS = {
  users: {
    label: "Users",
    column: "aiGatewayKeyOwnerUserId",
    subject: "user",
    scope: "USER",
    tableName: "gatewayUserBudgets",
  },
  apiKeys: {
    label: "API keys",
    column: "aiGatewayKeyId",
    subject: "key",
    scope: "API_KEY",
    tableName: "gatewayKeyBudgets",
  },
} as const satisfies Record<
  GatewayAnalyticsLabelSource,
  {
    label: string;
    column: string;
    subject: "key" | "user";
    scope: RouterInputs["aiGateway"]["setSpendLimits"]["scope"];
    tableName: string;
  }
>;

export type GatewaySpendTab = keyof typeof GATEWAY_SPEND_TABS;
