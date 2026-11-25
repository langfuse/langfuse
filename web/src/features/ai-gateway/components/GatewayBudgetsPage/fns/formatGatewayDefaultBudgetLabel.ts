import { formatGatewaySpendBudget } from "@/src/features/ai-gateway/fns/formatGatewaySpendBudget";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

/** The default budget button's label: the default, or how to set one. */
export function formatGatewayDefaultBudgetLabel(
  defaultBudget: GatewaySpendLimit | null | undefined,
) {
  if (!defaultBudget) return "Set default budget";
  return `Default: ${formatGatewaySpendBudget(defaultBudget)}`;
}
