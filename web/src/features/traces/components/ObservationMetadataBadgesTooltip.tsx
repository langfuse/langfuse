/**
 * Tooltip-based metadata badges for ObservationDetailView
 * These badges use BreakdownTooltip to show detailed cost/usage information
 */

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
  totalCost: number;
  costDetails: Record<string, number>;
  priceSource?: PriceSource;
}) {
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
  inputUsage,
  outputUsage,
  totalUsage,
  usageDetails,
}: {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
  usageDetails: Record<string, number>;
}) {
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
