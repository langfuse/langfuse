import { DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { areGatewaySpendBudgetAlertThresholdsEqual } from "@/src/features/ai-gateway/fns/spendLimits/areGatewaySpendBudgetAlertThresholdsEqual";

type GatewaySpendLimitValue = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
  alertThresholds?: readonly number[];
};

/**
 * The `spendLimit` to send when saving an edited key. Sending one replaces all
 * of the key's limits, so it is undefined (left unchanged) unless the budget
 * was changed, and always for a key with several limits, which the dialog
 * shows only the first of.
 */
export function toGatewaySpendLimitUpdate<
  T extends GatewaySpendLimitValue,
>(params: {
  loaded: T | null;
  hasSeveralSpendLimits: boolean;
  submitted: T | null | undefined;
}): T | null | undefined {
  const { loaded, submitted } = params;
  if (params.hasSeveralSpendLimits) return undefined;
  if (loaded === null && submitted === null) return undefined;
  if (loaded === null || submitted == null) return submitted;
  const isUnchanged =
    loaded.interval === submitted.interval &&
    loaded.limitUsd === submitted.limitUsd &&
    areGatewaySpendBudgetAlertThresholdsEqual(
      loaded.alertThresholds ?? DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
      submitted.alertThresholds ??
        DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS,
    );
  return isUnchanged ? undefined : submitted;
}
