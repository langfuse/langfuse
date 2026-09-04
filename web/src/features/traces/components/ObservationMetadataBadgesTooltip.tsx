/* eslint-disable @repo/no-null-render */
/**
 * Tooltip-based metadata badges for ObservationDetailView
 * These badges use BreakdownTooltip to show detailed cost/usage information
 */

import { type ObservationType, isGenerationLike } from "@langfuse/shared";
import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
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
  // Don't show if no cost data. Explicit 0 is a real value and should render.
  if (totalCost == null || !costDetails) return null;

  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
    >
      <Badge text={usdFormatter(totalCost)} trailingIcon={InfoIcon} />
    </BreakdownTooltip>
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

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <Badge text={tokenText} trailingIcon={InfoIcon} />
      ) : (
        <BadgeShell aria-label="View usage breakdown">
          <InfoIcon aria-hidden className="size-3" />
        </BadgeShell>
      )}
    </BreakdownTooltip>
  );
}
