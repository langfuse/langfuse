import type { GatewayBudgetStatus } from "@/src/features/ai-gateway/constants/gatewayBudgetStatuses";

/** With a default, every key or user has a budget, so none is unlimited; without one, none uses the default. */
export function isGatewayBudgetStatusShown(
  status: GatewayBudgetStatus,
  hasDefault: boolean,
) {
  return status !== (hasDefault ? "unlimited" : "default");
}
