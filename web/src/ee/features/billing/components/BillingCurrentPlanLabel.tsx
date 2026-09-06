// Langfuse Cloud only

import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { useTranslations } from "next-intl";

export const BillingCurrentPlanLabel = () => {
  const t = useTranslations("settingsEnterprise.billing.plan");
  const { planLabel, cancellation } = useBillingInformation();
  const preparedCancellationDate = buildLocalIsoDatePresentation({
    date: cancellation?.date,
    accuracy: "day",
  });

  return (
    <div>
      <>{t("current", { plan: planLabel })} </>
      {cancellation?.isCancelled && preparedCancellationDate && (
        <>
          {t.rich("endsOn", {
            date: () => (
              <span title={preparedCancellationDate.title}>
                {preparedCancellationDate.display}
              </span>
            ),
          })}
        </>
      )}
    </div>
  );
};
