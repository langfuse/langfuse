import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";
import { usdFormatter } from "@/src/utils/numbers";

/** Share of the limit from which a budget shows as nearly used up. */
const NEAR_LIMIT_SHARE = 0.8;

const intervalLabels: Record<GatewaySpendBudgetInterval, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
};

const requestsBySubject = {
  key: "Requests with this key",
  user: "Requests with this user's keys",
} as const;

type GatewaySpendBudgetBadgeProps = {
  /** What the budget caps: one key, or all keys of a user. */
  subject: keyof typeof requestsBySubject;
  spendLimit: { interval: GatewaySpendBudgetInterval; limitUsd: number };
  /** Undefined while spend is not recorded, so only the limit is shown. */
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
      ? formatUsd(spendLimit.limitUsd)
      : `${formatUsd(spendLimit.limitUsd)} ${intervalLabels[spendLimit.interval]}`;
  const { title, description } = describeBudget(
    spendLimit,
    spentUsd,
    requestsBySubject[subject],
  );

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
        <span {...getTriggerProps()} tabIndex={0} className="inline-flex">
          <Badge
            color={
              spentUsd === undefined
                ? "filled"
                : budgetColor(spentUsd, spendLimit.limitUsd)
            }
            size="md"
            interactive
            text={
              spentUsd === undefined
                ? limit
                : `${formatUsd(spentUsd)} / ${limit}`
            }
          />
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
        "Spend is counted only while gateway requests are recorded, so only the limit is shown.",
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
      budgetColor(spentUsd, limitUsd) === "warning"
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

function budgetColor(spentUsd: number, limitUsd: number) {
  if (spentUsd >= limitUsd) return "error";
  if (spentUsd >= limitUsd * NEAR_LIMIT_SHARE) return "warning";
  return "filled";
}

function formatUsd(value: number) {
  return usdFormatter(value, 0, 2);
}
