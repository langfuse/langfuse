import { ObservationType } from "@langfuse/shared";
import type { CostSource } from "@/src/features/traces/components/BreakdownTooltip";
import { hasBreakdown } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";

/** A GENERATION nothing priced, with or without usage. */
export function isGenerationMissingCost({
  type,
  totalCost,
  costDetails,
  internalModelId,
}: {
  type: string;
  totalCost: number | null | undefined;
  costDetails: Record<string, number> | undefined;
  internalModelId: string | null | undefined;
}): boolean {
  if (type !== ObservationType.GENERATION) return false;
  if (totalCost) return false;
  if (hasBreakdown(costDetails ?? {})) return false;
  // A matched model that priced the call at $0 is a real price.
  return totalCost == null || !internalModelId;
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
