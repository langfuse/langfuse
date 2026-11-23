import type { FilterState } from "@langfuse/shared";

import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

/** The filter schema refuses an empty `any of` list, and no key or user has this id. */
const NO_SUBJECT_ID = "\u0000no-gateway-spend-subject";

/** Spend of exactly these keys or users; none matches nothing. */
export function toGatewaySpendFilters(
  tab: GatewaySpendTab,
  selectedIds: string[],
): FilterState {
  return [
    {
      column: GATEWAY_SPEND_TABS[tab].column,
      operator: "any of",
      value: selectedIds.length > 0 ? selectedIds : [NO_SUBJECT_ID],
      type: "stringOptions",
    },
  ];
}
