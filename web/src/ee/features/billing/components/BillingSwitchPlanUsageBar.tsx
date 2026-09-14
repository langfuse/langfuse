import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { formatLocalIsoDate } from "@/src/utils/dates";
import type { RouterOutput } from "@/src/utils/types";

import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import {
  dataAccessLabelForTier,
  includedUnitsForTier,
  planTierLabel,
  usersLabelForTier,
  type PlanTier,
} from "@/src/ee/features/billing/utils/planComparison";

export function BillingSwitchPlanUsageBar({
  currentTier,
  priceLabel,
  memberCount,
  usage,
  hobbyPlanLimit = MAX_EVENTS_FREE_PLAN,
}: {
  currentTier: PlanTier;
  priceLabel: string;
  memberCount?: number;
  usage: Exclude<RouterOutput["cloudBilling"]["getUsage"], null> | undefined;
  hobbyPlanLimit?: number;
}) {
  const includedUnits =
    currentTier === "hobby"
      ? hobbyPlanLimit
      : includedUnitsForTier(currentTier);
  const usageCount = usage?.usageCount ?? 0;
  const usagePercent = Math.min((usageCount / includedUnits) * 100, 100);
  const overage = Math.max(usageCount - includedUnits, 0);
  const usageType = usage?.usageType ?? "units";
  const periodEnd = usage?.billingPeriod?.end;

  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-sm">
          <span className="text-muted-foreground">Current plan</span>{" "}
          <span className="font-bold">
            {planTierLabel(currentTier)} {priceLabel}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {usersLabelForTier(currentTier, memberCount)}
            {" · "}
            {dataAccessLabelForTier(currentTier)} of history
          </span>
        </p>
        {periodEnd ? (
          <p className="text-muted-foreground text-xs">
            Period resets {formatLocalIsoDate(periodEnd, false, "day")}
          </p>
        ) : null}
      </div>
      {usage ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {usageType.charAt(0).toUpperCase() + usageType.slice(1)} used this
              billing period
            </span>
            <span className="font-bold">
              {numberFormatter(usageCount, 0)} of{" "}
              {compactNumberFormatter(includedUnits)} included
            </span>
          </div>
          <div
            className="bg-muted h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {overage > 0 && currentTier !== "hobby" ? (
            <p className="text-muted-foreground text-xs">
              {numberFormatter(overage, 0)} {usageType} above the allowance,
              billed at $8 / 100k
            </p>
          ) : currentTier === "hobby" ? (
            <p className="text-muted-foreground text-xs">
              No additional usage — capped
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Loading usage…</p>
      )}
    </div>
  );
}
