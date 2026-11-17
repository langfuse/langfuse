import { Badge } from "@/src/components/design-system/Badge/Badge";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { usdFormatter } from "@/src/utils/numbers";

/** Share of the limit from which a budget shows as nearly used up. */
const NEAR_LIMIT_SHARE = 0.8;

const intervalLabels: Record<GatewaySpendBudgetInterval, string> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
};

type GatewayApiKeyBudgetCellProps = {
  spendLimit: { interval: GatewaySpendBudgetInterval; limitUsd: number };
  /** Undefined while spend is not recorded, so only the limit is shown. */
  spentUsd: number | undefined;
};

export function GatewayApiKeyBudgetCell({
  spendLimit,
  spentUsd,
}: GatewayApiKeyBudgetCellProps) {
  const limit = `${formatUsd(spendLimit.limitUsd)} ${intervalLabels[spendLimit.interval]}`;
  if (spentUsd === undefined) {
    return <Badge color="filled" size="md" text={limit} />;
  }

  return (
    <Badge
      color={budgetColor(spentUsd, spendLimit.limitUsd)}
      size="md"
      text={`${formatUsd(spentUsd)} / ${limit}`}
    />
  );
}

function budgetColor(spentUsd: number, limitUsd: number) {
  if (spentUsd >= limitUsd) return "error";
  if (spentUsd >= limitUsd * NEAR_LIMIT_SHARE) return "warning";
  return "filled";
}

function formatUsd(value: number) {
  return usdFormatter(value, 0, 2);
}
