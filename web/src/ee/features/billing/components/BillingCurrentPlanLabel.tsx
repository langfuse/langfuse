// Langfuse Cloud only

import { LocalIsoDate } from "@/src/components/LocalIsoDate";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { useTranslations } from "next-intl";

export const BillingCurrentPlanLabel = () => {
  const t = useTranslations("settingsEnterprise.billing.plan");
  const { planLabel, cancellation } = useBillingInformation();

  return (
    <div>
      <>{t("current", { plan: planLabel })} </>
      {cancellation?.isCancelled && cancellation.date && (
        <>
          {t.rich("endsOn", {
            date: () => (
              <LocalIsoDate date={cancellation.date!} accuracy="day" />
            ),
          })}
        </>
      )}
    </div>
  );
};
