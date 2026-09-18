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
import { Coins, InfoIcon } from "lucide-react";

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
  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
      costSource={costSource}
    >
      <Badge color="ghost" text={usdFormatter(totalCost)} underline />
    </BreakdownTooltip>
  );
}

export function UsageBadge({
  totalUsage,
  usageDetails,
}: {
  totalUsage: number;
  usageDetails: Record<string, number>;
}) {
  const tokenText = totalUsage > 0 ? numberFormatter(totalUsage, 0) : undefined;

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      {tokenText ? (
        <Badge
          color="ghost"
          leadingIcon={Coins}
          text={tokenText}
          title="Tokens"
          underline
        />
      ) : (
        <BadgeShell aria-label="View usage breakdown">
          <InfoIcon aria-hidden className="size-3" />
        </BadgeShell>
      )}
    </BreakdownTooltip>
  );
}
