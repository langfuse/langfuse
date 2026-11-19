import {
  emptyGatewaySpendBudget,
  type GatewaySpendBudgetFormValue,
} from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

/** A budget's form value, or the empty one when there is no budget. */
export function toGatewaySpendBudgetFormValue(
  spendLimit: GatewaySpendLimit | null,
): GatewaySpendBudgetFormValue {
  if (!spendLimit) return emptyGatewaySpendBudget;
  return {
    interval: spendLimit.interval,
    limitUsd: String(spendLimit.limitUsd),
  };
}

/** A checked form value as the budget the API takes. */
export function toGatewaySpendLimit(
  value: GatewaySpendBudgetFormValue,
): GatewaySpendLimit {
  return { interval: value.interval, limitUsd: Number(value.limitUsd.trim()) };
}
