// Langfuse Cloud only

import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { type Plan } from "@langfuse/shared";
import type { RouterOutput } from "@/src/utils/types";

export const BillingUsageChart = ({
  usage,
  hobbyPlanLimit,
  plan,
}: {
  usage: Exclude<RouterOutput["cloudBilling"]["getUsage"], null> | undefined;
  hobbyPlanLimit: number;
  plan: Plan;
}) => {
  const usageType = usage?.usageType
    ? usage.usageType.charAt(0).toUpperCase() + usage.usageType.slice(1)
    : "Events";

  return (
    <div>
      <Card className="p-3">
        {usage !== undefined ? (
          <>
            <p className="text-muted-foreground text-sm">
              {usage.billingPeriod
                ? `Consumed ${usageType} in current billing period (updated about once every 60 minutes)`
                : `Consumed ${usageType} / last 30d`}
            </p>
            <div className="text-3xl font-bold">
              {numberFormatter(usage.usageCount, 0)}
            </div>
            {plan === "cloud:hobby" && (
              <>
                <div className="mt-4 flex justify-between">
                  <span className="text-sm">{`${numberFormatter((usage.usageCount / hobbyPlanLimit) * 100)}%`}</span>
                  <span className="text-sm">
                    Plan limit: {compactNumberFormatter(hobbyPlanLimit)}
                  </span>
                </div>
                <div
                  className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={Math.min(
                    (usage.usageCount / hobbyPlanLimit) * 100,
                    100,
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        (usage.usageCount / hobbyPlanLimit) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">
            Loading (might take a moment) ...
          </span>
        )}
      </Card>
    </div>
  );
};
