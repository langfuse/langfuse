/* eslint-disable @repo/component-file-structure */
/** Cost and token metrics for the trace, observation and session headers; breakdowns open on hover. */

import { TriangleAlert } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
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
  /** A generation with tokens but no cost. */
  | { variant: "missing"; projectId: string };

export function CostBadge(props: CostBadgeProps) {
  if (props.variant === "missing") {
    return <MissingCostBadge projectId={props.projectId} />;
  }
  const { totalCost, costDetails, priceSource, costSource } = props;
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

function MissingCostBadge({ projectId }: { projectId: string }) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-col gap-1">
          <p className="text-xs">
            No model price matched this generation. Add a model price, or send
            the cost from your SDK.
          </p>
          <div className="flex items-center gap-1.5">
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/settings/models`}
              value="Model settings"
            />
            <span className="text-muted-foreground text-xs">·</span>
            <TextLink
              path="https://langfuse.com/docs/model-usage-and-cost"
              value="Docs"
              external
            />
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
          <Badge
            font="mono"
            color="ghost-warning"
            interactive
            leadingIcon={TriangleAlert}
            text="no cost"
          />
        </span>
      )}
    </CustomTooltip>
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
