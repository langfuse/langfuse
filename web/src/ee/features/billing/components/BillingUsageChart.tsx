// Langfuse Cloud only

import { api } from "@/src/utils/api";
import { MarkerBar } from "@tremor/react";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { type Plan } from "@langfuse/shared";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";

export const BillingUsageChart = () => {
  const organization = useQueryOrganization();

  const usage = api.cloudBilling.getUsage.useQuery(
    {
      orgId: organization?.id as string,
    },
    {
      enabled: organization !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const hobbyPlanLimit =
    organization?.cloudConfig?.monthlyObservationLimit ?? MAX_EVENTS_FREE_PLAN;
  const plan: Plan = organization?.plan ?? "cloud:hobby";
  const usageType = usage.data?.usageType
    ? usage.data.usageType.charAt(0).toUpperCase() +
      usage.data.usageType.slice(1)
    : "Events";

  return (
    <div>
      <Card className="p-3">
        {usage.data !== undefined ? (
          <>
            <p className="text-sm text-muted-foreground">
              {usage.data.billingPeriod
                ? `${usageType} in current billing period`
                : `${usageType} / last 30d`}
            </p>
            <div className="text-3xl font-bold">
              {numberFormatter(usage.data.usageCount, 0)}
            </div>
            {plan === "cloud:hobby" && (
              <>
                <div className="mt-4 flex justify-between">
                  <span className="text-sm">{`${numberFormatter((usage.data.usageCount / hobbyPlanLimit) * 100)}%`}</span>
                  <span className="text-sm">
                    Plan limit: {compactNumberFormatter(hobbyPlanLimit)}
                  </span>
                </div>
                <MarkerBar
                  value={Math.min(
                    (usage.data.usageCount / hobbyPlanLimit) * 100,
                    100,
                  )}
                  className="mt-3"
                />
              </>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            Loading (might take a moment) ...
          </span>
        )}
      </Card>
    </div>
  );
};
