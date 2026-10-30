import { ObservationType } from "@langfuse/shared";
import type { CostSource } from "@/src/features/traces/components/BreakdownTooltip";

/** A GENERATION that recorded tokens but nothing priced them. */
export function isGenerationMissingCost({
  type,
  totalUsage,
  totalCost,
  costDetails,
}: {
  type: string;
  totalUsage: number;
  totalCost: number | null | undefined;
  costDetails: Record<string, number> | undefined;
}): boolean {
  if (type !== ObservationType.GENERATION) return false;
  if (totalUsage <= 0) return false;
  if (totalCost) return false;
  return Object.keys(costDetails ?? {}).length === 0;
}

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
