/* eslint-disable @repo/component-file-structure, @typescript-eslint/no-use-before-define */
/** Cost and token metrics for the trace, observation and session headers; breakdowns open on hover. */

import { Metric } from "@/src/components/design-system/Metric/Metric";
import { UsageCostWarningBadge } from "@/src/features/traces/components/UsageCostWarningBadge";
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

type CostBadgeProps =
  | {
      variant?: "cost";
      totalCost: number;
      costDetails: Record<string, number>;
      priceSource?: PriceSource;
      costSource?: CostSource;
    }
  /** A generation nothing priced; the tooltip differs when no usage was sent either. */
  | { variant: "missing"; projectId: string; hasUsage: boolean };

export function CostBadge(props: CostBadgeProps) {
  if (props.variant === "missing") {
    return (
      <UsageCostWarningBadge
        projectId={props.projectId}
        label="no cost"
        description={
          props.hasUsage
            ? "No model price matched this generation. Add a model definition, or submit costs directly."
            : "No token usage or cost was submitted for this generation. Send token usage and a model name, or submit costs directly."
        }
      />
    );
  }
  const { totalCost, costDetails, priceSource, costSource } = props;
  if (!hasBreakdown(costDetails)) {
    return (
      <Metric
        value={formatMetricCost(totalCost)}
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
      <Metric interactive value={formatMetricCost(totalCost)} />
    </BreakdownTooltip>
  );
}

/** A breakdown of nothing but zeros has nothing to say. */
export const hasBreakdown = (details: Record<string, number>) =>
  Object.values(details).some((value) => value > 0);
