// Langfuse Cloud only

import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";

export const BillingCurrentPlanLabel = () => {
  const { planLabel, cancellation } = useBillingInformation();
  const preparedCancellationDate = buildLocalIsoDatePresentation({
    date: cancellation?.date,
    accuracy: "day",
  });

  return (
    <div>
      <>Current plan: {planLabel} </>
      {cancellation?.isCancelled && preparedCancellationDate && (
        <>
          <span>(will end on </span>
          <span title={preparedCancellationDate.title}>
            {preparedCancellationDate.display}
          </span>
          <span>)</span>
        </>
      )}
    </div>
  );
};
