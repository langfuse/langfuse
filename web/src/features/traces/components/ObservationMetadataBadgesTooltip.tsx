/**
 * Tooltip-based metadata badges for ObservationDetailView
 * These badges use BreakdownTooltip to show detailed cost/usage information
 * Metric values render in mono; `contents` keeps the wrapper out of layout.
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
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
    return (
      <span className="contents font-mono">
        <Badge color="ghost" text={usdFormatter(totalCost)} />
      </span>
    );
  }
  return (
    <span className="contents font-mono">
      <BreakdownTooltip
        details={costDetails}
        isCost={true}
        priceSource={priceSource}
        costSource={costSource}
      >
        <Badge color="ghost" interactive text={usdFormatter(totalCost)} />
      </BreakdownTooltip>
    </span>
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
  const tokenText = `${numberFormatter(totalUsage, 0)} tokens`;

  if (!hasBreakdown(usageDetails)) {
    return (
      <span className="contents font-mono">
        <Badge color="ghost" text={tokenText} />
      </span>
    );
  }

  return (
    <span className="contents font-mono">
      <BreakdownTooltip details={usageDetails} isCost={false}>
        <Badge color="ghost" interactive text={tokenText} />
      </BreakdownTooltip>
    </span>
  );
}
