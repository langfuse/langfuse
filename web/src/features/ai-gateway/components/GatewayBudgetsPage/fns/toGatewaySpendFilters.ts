import type { FilterState } from "@langfuse/shared";

import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/** No selection means the total of all gateway spend, not a breakdown. */
export function toGatewaySpendFilters(
  tab: GatewaySpendTab,
  selectedId: string | null,
): FilterState {
  if (selectedId === null) return [];
  return [
    {
      column: GATEWAY_SPEND_TABS[tab].column,
      operator: "any of",
      value: [selectedId],
      type: "stringOptions",
    },
  ];
}
