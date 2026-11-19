import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import { formatGatewayBudgetUsd } from "@/src/features/ai-gateway/fns/formatGatewayBudgetUsd";
import { formatGatewaySpendBudget } from "@/src/features/ai-gateway/fns/formatGatewaySpendBudget";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import { GatewaySpendBudgetStatusDot } from "@/src/features/ai-gateway/components/GatewaySpendBudgetStatusDot/GatewaySpendBudgetStatusDot";
import { getGatewaySpendBudgetStatus } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetStatus";

const requestsBySubject = {
  key: "Requests with this key",
  user: "Requests with this user's keys",
  organization: "Requests in this organization",
} as const;

type GatewaySpendBudgetBadgeProps = {
  /** What the budget caps: one key, all keys of a user, or the whole organization. */
  subject: keyof typeof requestsBySubject;
  spendLimit: GatewaySpendLimit;
  /** Undefined while spend is not recorded, so only the budget is shown. */
  spentUsd: number | undefined;
  /** "amounts" leaves out the interval, for tables that show it in a column of its own. */
  format?: "withInterval" | "amounts";
};

export function GatewaySpendBudgetBadge({
  subject,
  spendLimit,
  spentUsd,
  format = "withInterval",
}: GatewaySpendBudgetBadgeProps) {
  const limit =
    format === "amounts"
      ? formatGatewayBudgetUsd(spendLimit.limitUsd)
      : formatGatewaySpendBudget(spendLimit);
  const { title, description } = describeBudget(
    spendLimit,
    spentUsd,
    requestsBySubject[subject],
  );

  const status =
    spentUsd === undefined
      ? "ok"
      : getGatewaySpendBudgetStatus(spentUsd, spendLimit.limitUsd);
  const text =
    spentUsd === undefined
      ? limit
      : `${formatGatewayBudgetUsd(spentUsd)} / ${limit}`;

  return (
    <CustomTooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{description}</span>
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          tabIndex={0}
          className="inline-flex items-center gap-1.5 font-mono text-xs"
        >
          {text}
          {status !== "ok" && <GatewaySpendBudgetStatusDot status={status} />}
        </span>
      )}
    </CustomTooltip>
  );
}

function describeBudget(
  { interval, limitUsd }: GatewaySpendBudgetBadgeProps["spendLimit"],
  spentUsd: number | undefined,
  requests: string,
) {
  if (spentUsd === undefined) {
    return {
      title: "Spend unavailable",
      description:
        "Spend is counted only while gateway requests are recorded, so only the budget is shown.",
    };
  }
  const resetsAt = formatResetsAt(interval);
  if (spentUsd >= limitUsd) {
    return {
      title: "Budget reached",
      description: resetsAt
        ? `${requests} are rejected until the budget resets on ${resetsAt}.`
        : `${requests} are rejected until an admin raises or removes the budget.`,
    };
  }
  const used = `${Math.floor((spentUsd / limitUsd) * 100)}% of the budget is used.`;
  return {
    title:
      getGatewaySpendBudgetStatus(spentUsd, limitUsd) === "near"
        ? "Budget nearly reached"
        : "Within budget",
    description: resetsAt
      ? `${used} It resets on ${resetsAt}.`
      : `${used} It never resets.`,
  };
}

function formatResetsAt(interval: GatewaySpendBudgetInterval) {
  return getGatewaySpendLimitWindowEnd(
    interval,
    getGatewaySpendLimitWindowStart(interval),
  )?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
