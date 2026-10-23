/* eslint-disable @repo/component-file-structure, @typescript-eslint/no-use-before-define */
/** Cost and token metrics for the trace, observation and session headers; breakdowns open on hover. */

import { TriangleAlert } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  prefilledPricesFromUsage,
  UpsertModelFormDialogController,
} from "@/src/features/models";
import { useHasProjectAccess } from "@/src/features/rbac";
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
  | {
      variant: "missing";
      projectId: string;
      hasUsage: boolean;
      model: string | null;
      usageDetails: Record<string, number> | undefined;
    };

export function CostBadge(props: CostBadgeProps) {
  if (props.variant === "missing") {
    const { variant: _variant, ...missingProps } = props;
    return <MissingCostBadge {...missingProps} />;
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

function MissingCostBadge({
  projectId,
  hasUsage,
  model,
  usageDetails,
}: {
  projectId: string;
  hasUsage: boolean;
  model: string | null;
  usageDetails: Record<string, number> | undefined;
}) {
  const canCreateModel = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });
  const settingsPath = `/project/${encodeURIComponent(projectId)}/settings/models`;
  const renderChip = (openDialog?: () => void) => (
    <CustomTooltip
      renderContent={({ close }) => (
        <div className="flex flex-col gap-1">
          <p className="text-xs">
            {hasUsage
              ? "No model price matched this generation. Add a model price, or send the cost from your SDK."
              : "No usage or cost was sent for this generation. Send usage (e.g. characters) and add a model price, or send the cost from your SDK."}
          </p>
          <div className="flex items-center gap-1.5">
            {openDialog ? (
              <TextLink
                path={settingsPath}
                value="Add model price"
                onClick={() => {
                  close();
                  openDialog();
                }}
              />
            ) : (
              <TextLink path={settingsPath} value="Model settings" />
            )}
            <span className="text-muted-foreground text-xs">·</span>
            <TextLink
              path="https://langfuse.com/docs/model-usage-and-cost"
              value="Docs"
              external
            />
          </div>
        </div>
      )}
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

  if (!model || !canCreateModel) return renderChip();
  // The dialog lives outside the tooltip so closing the tooltip cannot unmount it.
  return (
    <UpsertModelFormDialogController
      action="create"
      projectId={projectId}
      prefilledModelData={{
        modelName: model,
        prices: prefilledPricesFromUsage(usageDetails),
      }}
    >
      {({ openDialog }) => renderChip(openDialog)}
    </UpsertModelFormDialogController>
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
