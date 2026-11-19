import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";

type GatewaySpendLimitValue = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

/**
 * The `spendLimit` to send when saving an edited key. Sending one replaces all
 * of the key's limits, so it is undefined (left unchanged) unless the budget
 * was changed, and always for a key with several limits, which the dialog
 * shows only the first of.
 */
export function toGatewaySpendLimitUpdate(params: {
  loaded: GatewaySpendLimitValue | null;
  hasSeveralSpendLimits: boolean;
  submitted: GatewaySpendLimitValue | null | undefined;
}): GatewaySpendLimitValue | null | undefined {
  const { loaded, submitted } = params;
  if (params.hasSeveralSpendLimits) return undefined;
  const isUnchanged =
    loaded?.interval === submitted?.interval &&
    loaded?.limitUsd === submitted?.limitUsd;
  return isUnchanged ? undefined : submitted;
}
