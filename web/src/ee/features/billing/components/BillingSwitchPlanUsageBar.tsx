import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { formatLocalIsoDate } from "@/src/utils/dates";
import type { RouterOutput } from "@/src/utils/types";

import {
  planTierLabel,
  type PlanTier,
} from "@/src/ee/features/billing/utils/planComparison";

export function BillingSwitchPlanUsageBar({
  currentTier,
  includedUnits,
  usage,
  usageLoading = false,
}: {
  currentTier: PlanTier;
  includedUnits: number;
  usage: Exclude<RouterOutput["cloudBilling"]["getUsage"], null> | undefined;
  usageLoading?: boolean;
}) {
  const usageCount = usage?.usageCount;
  const usageType = usage?.usageType ?? "units";
  const periodEnd = usage?.billingPeriod?.end;
  const hasUsage = typeof usageCount === "number";
  const usagePercent = hasUsage
    ? Math.min((usageCount / Math.max(includedUnits, 1)) * 100, 100)
    : 0;

  const usedLabel = usageLoading
    ? "…"
    : hasUsage
      ? `${numberFormatter(usageCount, 0)} ${usageType}`
      : "unavailable";

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground text-sm">
        {`Current plan: ${planTierLabel(currentTier)} · Used this billing period: ${usedLabel}`}
      </p>
      {hasUsage ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-foreground font-bold">
              {numberFormatter(usageCount, 0)} of{" "}
              {compactNumberFormatter(includedUnits)} included
            </span>
            {periodEnd ? (
              <span className="text-muted-foreground">
                Period resets {formatLocalIsoDate(periodEnd, false, "day")}
              </span>
            ) : null}
          </div>
          <div
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-label={`${usageType} used this billing period`}
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
