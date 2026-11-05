/* eslint-disable @repo/component-file-structure, @typescript-eslint/no-use-before-define */
/** Cost and token metrics for the trace, observation and session headers; breakdowns open on hover. */

import { TriangleAlert } from "@langfuse/icons";

import { Metric } from "@/src/components/design-system/Metric/Metric";
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
  /** A generation nothing priced; the tooltip differs when no usage was sent either. */
  | { variant: "missing"; projectId: string; hasUsage: boolean };

export function CostBadge(props: CostBadgeProps) {
  if (props.variant === "missing") {
    return (
      <MissingCostBadge projectId={props.projectId} hasUsage={props.hasUsage} />
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

function MissingCostBadge({
  projectId,
  hasUsage,
}: {
  projectId: string;
  hasUsage: boolean;
}) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-col gap-1">
          <p className="text-xs">
            {hasUsage
              ? "No model price matched this generation. Add a model definition, or submit costs directly."
              : "No token usage or cost was submitted for this generation. Send token usage and a model name, or submit costs directly."}
          </p>
          <div className="flex items-center gap-1.5">
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/settings/models`}
              value="Model settings"
            />
            <span className="text-muted-foreground text-xs">·</span>
            <TextLink
              path="https://langfuse.com/docs/observability/features/token-and-cost-tracking#ingest-usage-and-cost-manually"
              value="Docs"
              external
            />
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} className="inline-flex" tabIndex={0}>
          <Metric
            interactive
            icon={TriangleAlert}
            iconTone="warning"
            value="no cost"
          />
        </span>
      )}
    </CustomTooltip>
  );
}

export function MissingUsageBadge({ projectId }: { projectId: string }) {
  return (
    <CustomTooltip
      content={
        <div className="flex flex-col gap-1">
          <p className="text-xs">
            No token usage was submitted for this generation. Send token usage
            and a model name, or submit costs directly.
          </p>
          <div className="flex items-center gap-1.5">
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/settings/models`}
              value="Model settings"
            />
            <span className="text-muted-foreground text-xs">·</span>
            <TextLink
              path="https://langfuse.com/docs/observability/features/token-and-cost-tracking#ingest-usage-and-cost-manually"
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
            text="usage not submitted"
          />
        </span>
      )}
    </CustomTooltip>
  );
}

/** A breakdown of nothing but zeros has nothing to say. */
export const hasBreakdown = (details: Record<string, number>) =>
  Object.values(details).some((value) => value > 0);
