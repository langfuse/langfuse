import { isGenerationLike, type ObservationType } from "@langfuse/shared";

import { usdFormatter } from "@/src/utils/numbers";

export const MISSING_OBSERVATION_COST_PLACEHOLDER = "-";

/**
 * Types that ingestion can attach usage/cost to (CreateGenerationBody),
 * matching `isGenerationLike`. Used to describe typical cost-bearing rows;
 * display still follows a stored amount, not this set alone.
 */
export function isObservationCostSupported(
  observationType: ObservationType | string | undefined,
): boolean {
  if (observationType == null) return false;
  return isGenerationLike(observationType as ObservationType);
}

/**
 * True when the cell should show a numeric cost, including an explicit 0.
 * Missing values render as a dash. A persisted amount is not hidden by type.
 */
export function isObservationCostDisplayable(
  cost: number | null | undefined,
  _observationType?: ObservationType | string,
): cost is number {
  return cost != null;
}

export function formatObservationCost(
  cost: number | null | undefined,
  observationType?: ObservationType | string,
): string {
  if (!isObservationCostDisplayable(cost, observationType)) {
    return MISSING_OBSERVATION_COST_PLACEHOLDER;
  }
  return usdFormatter(cost);
}
