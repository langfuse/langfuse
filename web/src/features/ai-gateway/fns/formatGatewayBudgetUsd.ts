import { usdFormatter } from "@/src/utils/numbers";

/** A budget amount or spend in USD, with cents only when there are any. */
export function formatGatewayBudgetUsd(value: number) {
  return usdFormatter(value, 0, 2);
}
