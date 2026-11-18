import type { FilterState } from "@langfuse/shared";

import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/** Spend of exactly these keys or users; none matches nothing. */
export function toGatewaySpendFilters(
  tab: GatewaySpendTab,
  selectedIds: string[],
): FilterState {
  return [
    {
      column: GATEWAY_SPEND_TABS[tab].column,
      operator: "any of",
      value: selectedIds,
      type: "stringOptions",
    },
  ];
}
