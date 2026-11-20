import { normalizeGatewaySpendBudgetAlertThresholds } from "./normalizeGatewaySpendBudgetAlertThresholds";

/** Whether two alert threshold lists represent the same enabled thresholds. */
export function areGatewaySpendBudgetAlertThresholdsEqual(
  first: readonly number[],
  second: readonly number[],
): boolean {
  const left = normalizeGatewaySpendBudgetAlertThresholds(first);
  const right = normalizeGatewaySpendBudgetAlertThresholds(second);
  return (
    left.length === right.length &&
    left.every((threshold, index) => threshold === right[index])
  );
}
