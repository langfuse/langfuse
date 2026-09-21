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
import { InfoIcon } from "lucide-react";

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
    return <Badge text={usdFormatter(totalCost)} />;
  }
  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
      costSource={costSource}
    >
      <Badge
        label="cost"
        text={usdFormatter(totalCost)}
        trailingIcon={InfoIcon}
      />
    </BreakdownTooltip>
  );
}

/** A breakdown of nothing but zeros has nothing to say. */
const hasBreakdown = (details: Record<string, number>) =>
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
    return <Badge text={tokenText} />;
  }

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <Badge label="tokens" text={tokenText} trailingIcon={InfoIcon} />
      ) : (
        <BadgeShell aria-label="View usage breakdown">
          <InfoIcon aria-hidden className="size-3" />
        </BadgeShell>
      )}
    </BreakdownTooltip>
  );
}
