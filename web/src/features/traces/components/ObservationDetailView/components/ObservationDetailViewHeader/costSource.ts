import type { CostSource } from "@/src/features/traces/components/BreakdownTooltip";

export function resolveObservationCostSource({
  hasSubtreeMetrics,
  hasProvidedCostDetails,
}: {
  hasSubtreeMetrics: boolean;
  hasProvidedCostDetails: boolean;
}): CostSource | undefined {
  if (hasSubtreeMetrics) return undefined;

  return hasProvidedCostDetails ? "provided" : "calculated";
}
