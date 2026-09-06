// Langfuse Cloud only

import { api } from "@/src/utils/api";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { numberFormatter, compactNumberFormatter } from "@/src/utils/numbers";
import { type Plan } from "@langfuse/shared";
import { MAX_EVENTS_FREE_PLAN } from "@/src/ee/features/billing/constants";
import { useTranslations } from "next-intl";

export const BillingUsageChart = () => {
  const t = useTranslations("settingsEnterprise.billing.usage");
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
    ? usage.data.usageType.toLowerCase() === "events"
      ? t("events")
      : usage.data.usageType
    : t("events");

  if (usage.data === null) {
    // Might happen in dev mode if STRIPE_SECRET_KEY is not set
    // This avoids errors for all developers not working on or testing the billing features
    return null;
  }

  return (
    <div>
      <Card className="p-3">
        {usage.data !== undefined ? (
          <>
            <p className="text-muted-foreground text-sm">
              {usage.data.billingPeriod
                ? t("currentPeriod", { usageType })
                : t("last30Days", { usageType })}
            </p>
            <div className="text-3xl font-bold">
              {numberFormatter(usage.data.usageCount, 0)}
            </div>
            {plan === "cloud:hobby" && (
              <>
                <div className="mt-4 flex justify-between">
                  <span className="text-sm">{`${numberFormatter((usage.data.usageCount / hobbyPlanLimit) * 100)}%`}</span>
                  <span className="text-sm">
                    {t("planLimit", {
                      limit: compactNumberFormatter(hobbyPlanLimit),
                    })}
                  </span>
                </div>
                <div
                  className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-label={t("progressLabel")}
                  aria-valuetext={t("progressValue", {
                    percentage: numberFormatter(
                      (usage.data.usageCount / hobbyPlanLimit) * 100,
                    ),
                  })}
                  aria-valuenow={Math.min(
                    (usage.data.usageCount / hobbyPlanLimit) * 100,
                    100,
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        (usage.data.usageCount / hobbyPlanLimit) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">{t("loading")}</span>
        )}
      </Card>
    </div>
  );
};
