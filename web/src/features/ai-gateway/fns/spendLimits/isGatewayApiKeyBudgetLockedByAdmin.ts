import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

/** Whether a gateway admin set the key's budget, or it has the default, so the caller may neither change nor reset it. */
export function isGatewayApiKeyBudgetLockedByAdmin(row: {
  spendLimit: GatewaySpendLimit | null;
  defaultSpendLimit?: GatewaySpendLimit | null;
  canResetBudget: boolean;
}) {
  return (
    (row.spendLimit !== null || Boolean(row.defaultSpendLimit)) &&
    !row.canResetBudget
  );
}
