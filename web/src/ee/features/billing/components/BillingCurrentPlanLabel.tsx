// Langfuse Cloud only

import { prepareLocalIsoDate } from "@/src/components/LocalIsoDate";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";

export const BillingCurrentPlanLabel = () => {
  const { planLabel, cancellation } = useBillingInformation();
  const cancellationDate = cancellation?.date
    ? prepareLocalIsoDate({ date: cancellation.date, accuracy: "day" })
    : null;

  return (
    <div>
      <>Current plan: {planLabel} </>
      {cancellation?.isCancelled && cancellation.date && (
        <>
          <span>(will end on </span>
          {cancellationDate ? (
            <span title={cancellationDate.title}>
              {cancellationDate.display}
            </span>
          ) : null}
          <span>)</span>
        </>
      )}
    </div>
  );
};
