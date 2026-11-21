/** Share of the limit from which a budget shows as nearly used up. */
const NEAR_LIMIT_SHARE = 0.8;

/** Whether a budget is reached, nearly reached, or neither. */
export function getGatewaySpendBudgetStatus(
  spentUsd: number,
  limitUsd: number,
) {
  if (spentUsd >= limitUsd) return "reached";
  if (spentUsd >= limitUsd * NEAR_LIMIT_SHARE) return "near";
  return "ok";
}
