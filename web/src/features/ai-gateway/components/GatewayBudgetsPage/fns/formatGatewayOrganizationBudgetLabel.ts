import { formatGatewayBudgetUsd } from "@/src/features/ai-gateway/fns/formatGatewayBudgetUsd";
import { formatGatewaySpendBudget } from "@/src/features/ai-gateway/fns/formatGatewaySpendBudget";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

/** The organization budget button's label: spend and budget, how to set one, or neither while it is unknown. */
export function formatGatewayOrganizationBudgetLabel(
  budget:
    | { spendLimit: GatewaySpendLimit; spentUsd: number | undefined }
    | null
    | undefined,
) {
  if (budget === undefined) return "Organization budget";
  if (budget === null) return "Set organization budget";
  const limit = formatGatewaySpendBudget(budget.spendLimit);
  if (budget.spentUsd === undefined) return `Organization: ${limit}`;
  return `Organization: ${formatGatewayBudgetUsd(budget.spentUsd)} / ${limit}`;
}
