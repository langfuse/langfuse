/**
 * Tooltip-based metadata badges for ObservationDetailView
 * These badges use BreakdownTooltip to show detailed cost/usage information
 */

import { type ObservationType, isGenerationLike } from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import {
  BreakdownTooltip,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import { InfoIcon } from "lucide-react";

export function CostBadge({
  totalCost,
  costDetails,
  priceSource,
}: {
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
  priceSource?: PriceSource;
}) {
  // Don't show if no cost data or cost is 0
  if (totalCost == null || totalCost === 0 || !costDetails) return null;

  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
    >
      <Badge variant="tertiary" className="flex items-center gap-1">
        <span>{usdFormatter(totalCost)}</span>
        <InfoIcon className="h-3 w-3" />
      </Badge>
    </BreakdownTooltip>
  );
}

function hasNonZeroUsageDetails(
  usageDetails: Record<string, number> | undefined,
): usageDetails is Record<string, number> {
  return Object.values(usageDetails ?? {}).some((value) => (value ?? 0) !== 0);
}

export function UsageBadge({
  type,
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  type: ObservationType;
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number> | undefined;
}) {
  const hasBreakdown = hasNonZeroUsageDetails(usageDetails);
  const tokenText = formatTokenCounts(
    inputUsage,
    outputUsage,
    totalUsage,
    true,
  );
  const hasText = tokenText.length > 0;

  if (!isGenerationLike(type) || (!hasText && !hasBreakdown)) return null;

  const badge = (
    <Badge
      variant="tertiary"
      className={`flex items-center gap-1 ${!hasText ? "h-6 pl-2" : ""}`}
    >
      {hasText ? <span>{tokenText}</span> : null}
      {hasBreakdown ? <InfoIcon className="h-3 w-3" /> : null}
    </Badge>
  );

  if (!hasBreakdown) return badge;

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {badge}
    </BreakdownTooltip>
  );
}
