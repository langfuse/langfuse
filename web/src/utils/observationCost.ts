import { ObservationType } from "@langfuse/shared";

import { usdFormatter } from "@/src/utils/numbers";

export const MISSING_OBSERVATION_COST_PLACEHOLDER = "-";

/**
 * Cost is only supported on GENERATION observations. Other types cannot have
 * cost set, so the UI should not render a numeric cost for them.
 */
export function isObservationCostSupported(
  observationType: ObservationType | string | undefined,
): boolean {
  return observationType === ObservationType.GENERATION;
}

/**
 * True when the observation should show a numeric cost, including an explicit 0.
 * Missing values and unsupported types are not displayable.
 */
export function isObservationCostDisplayable(
  cost: number | null | undefined,
  observationType: ObservationType | string | undefined,
): cost is number {
  return isObservationCostSupported(observationType) && cost != null;
}

export function formatObservationCost(
  cost: number | null | undefined,
  observationType: ObservationType | string | undefined,
): string {
  if (!isObservationCostDisplayable(cost, observationType)) {
    return MISSING_OBSERVATION_COST_PLACEHOLDER;
  }
  return usdFormatter(cost);
}
