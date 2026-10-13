/** Cost and token metrics for the trace, observation and session headers; breakdowns open on hover. */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import {
  BreakdownTooltip,
  type CostSource,
  type PriceSource,
} from "@/src/features/traces/components/BreakdownTooltip";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";

/** Header cost: short, with the exact value on hover. */
export const formatMetricCost = (cost: number) => usdFormatter(cost, 2, 3);

/** Header tokens, e.g. "21k tokens". */
export const formatMetricTokens = (tokens: number) =>
  `${compactNumberFormatter(tokens, 0).toLowerCase()} tokens`;

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
      <Badge
        font="mono"
        color="ghost"
        text={formatMetricCost(totalCost)}
        title={`exact $${totalCost.toFixed(6)}`}
      />
    );
  }
  return (
    <BreakdownTooltip
      details={costDetails}
      isCost={true}
      priceSource={priceSource}
      costSource={costSource}
    >
      <Badge
        font="mono"
        color="ghost"
        interactive
        text={formatMetricCost(totalCost)}
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
  const tokenText = formatMetricTokens(totalUsage);

  if (!hasBreakdown(usageDetails)) {
    return <Badge font="mono" color="ghost" text={tokenText} />;
  }

  return (
    <BreakdownTooltip details={usageDetails} isCost={false}>
      <Badge font="mono" color="ghost" interactive text={tokenText} />
    </BreakdownTooltip>
  );
}
