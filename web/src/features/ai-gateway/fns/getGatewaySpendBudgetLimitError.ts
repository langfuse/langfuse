import { GATEWAY_SPEND_BUDGET_MAX_USD } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";

/** Why a typed spend budget amount is invalid, or null when it is valid. */
export function getGatewaySpendBudgetLimitError(value: string) {
  const limitUsd = Number(value.trim() || NaN);
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) {
    return "Enter an amount greater than $0.";
  }
  if (limitUsd > GATEWAY_SPEND_BUDGET_MAX_USD) {
    return "Enter at most $1,000,000,000.";
  }
  return null;
}
