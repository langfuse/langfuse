/**
 * Tooltip-based metadata badges for ObservationDetailView
 * These badges use BreakdownTooltip to show detailed cost/usage information
 */

import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  BreakdownTooltip,
  type CostSource,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";

export function CostBadge({
  totalCost,
  costDetails,
  priceSource,
  costSource,
}: {
  totalCost: number;
  costDetails: Record<string, number>;
  priceSource?: PriceSource;
  costSource?: CostSource;
}) {
  if (!hasBreakdown(costDetails)) {
    return <Badge color="ghost" text={usdFormatter(totalCost)} />;
  }
  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
      costSource={costSource}
    >
      <Badge
        color="ghost"
        interactive
        label="cost"
        text={usdFormatter(totalCost)}
      />
    </BreakdownTooltip>
  );
}

/** A breakdown of nothing but zeros has nothing to say. */
export const hasBreakdown = (details: Record<string, number>) =>
  Object.values(details).some((value) => value > 0);

export function UsageBadge({
  totalUsage,
  usageDetails,
}: {
  totalUsage: number;
  usageDetails: Record<string, number>;
}) {
  const tokenText = totalUsage > 0 ? numberFormatter(totalUsage, 0) : undefined;

  if (tokenText && !hasBreakdown(usageDetails)) {
    return <Badge color="ghost" text={tokenText} />;
  }

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <Badge color="ghost" interactive label="tokens" text={tokenText} />
      ) : (
        <BadgeShell color="ghost" interactive aria-label="View usage breakdown">
          tokens
        </BadgeShell>
      )}
    </BreakdownTooltip>
  );
}
