import {
  ObservationLevel,
  ObservationType,
  type ObservationLevelType,
} from "@langfuse/shared";
import type { CostSource } from "@/src/features/traces/components/BreakdownTooltip";

/** A GENERATION nothing priced, with or without usage. */
export function isGenerationMissingCost({
  type,
  level,
  totalCost,
  costDetails,
  providedUsageDetails,
  providedCostDetails,
}: {
  type: string;
  level: ObservationLevelType;
  totalCost: number | null | undefined;
  costDetails: Record<string, number> | undefined;
  providedUsageDetails: Record<string, number> | undefined;
  providedCostDetails: Record<string, number> | undefined;
}): boolean {
  if (type !== ObservationType.GENERATION) return false;
  // A supplied cost is authoritative, including an explicit zero.
  if (Object.keys(providedCostDetails ?? {}).length > 0) return false;
  const submittedUsage = Object.values(providedUsageDetails ?? {});
  if (level === ObservationLevel.ERROR && submittedUsage.length === 0)
    return false;
  if (submittedUsage.length > 0 && submittedUsage.every((value) => value === 0))
    return false;
  if (totalCost) return false;
  return Object.keys(costDetails ?? {}).length === 0;
}

/** A generation did not submit any token usage or cost for this observation. */
export function isGenerationMissingUsage({
  type,
  level,
  providedUsageDetails,
  providedCostDetails,
}: {
  type: string;
  level: ObservationLevelType;
  providedUsageDetails: Record<string, number> | undefined;
  providedCostDetails: Record<string, number> | undefined;
}): boolean {
  if (type !== ObservationType.GENERATION || level === ObservationLevel.ERROR)
    return false;
  return (
    Object.keys(providedUsageDetails ?? {}).length === 0 &&
    Object.keys(providedCostDetails ?? {}).length === 0
  );
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
