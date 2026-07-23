/**
 * Tooltip-backed overview-grid rows for ObservationDetailView.
 * Cost and token usage render as mono values with a trailing ⓘ that opens
 * the BreakdownTooltip with the detailed cost/usage breakdown.
 */

import { type ObservationType, isGenerationLike } from "@langfuse/shared";
import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";
import { BreakdownTooltip } from "@/src/components/trace/components/_shared/BreakdownToolTip";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import { InfoIcon } from "lucide-react";

export function CostBadge({
  totalCost,
  costDetails,
}: {
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
}) {
  // Don't show if no cost data or cost is 0
  if (totalCost == null || totalCost === 0 || !costDetails) return null;

  return (
    <OverviewRow label="Cost">
      <BreakdownTooltip details={costDetails} isCost={true}>
        <span className="inline-flex items-center gap-1">
          {usdFormatter(totalCost)}
          <InfoIcon className="text-muted-foreground h-2.5 w-2.5 shrink-0" />
        </span>
      </BreakdownTooltip>
    </OverviewRow>
  );
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
  // Only show for generation-like observations
  if (!isGenerationLike(type) || !usageDetails) return null;

  const tokenText = formatTokenCounts(
    inputUsage,
    outputUsage,
    totalUsage,
    true,
  );
  const hasText = tokenText.length > 0;

  return (
    <OverviewRow label="Tokens" title={hasText ? tokenText : undefined}>
      <BreakdownTooltip details={usageDetails} isCost={false}>
        <span className="inline-flex max-w-full items-center gap-1">
          {hasText && (
            <span className="truncate" title={tokenText}>
              {tokenText}
            </span>
          )}
          <InfoIcon className="text-muted-foreground h-2.5 w-2.5 shrink-0" />
        </span>
      </BreakdownTooltip>
    </OverviewRow>
  );
}
