// Langfuse Cloud only

import { LocalIsoDate } from "@/src/components/LocalIsoDate";

import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";

export const BillingCurrentPlanLabel = () => {
  const { planLabel, cancellation } = useBillingInformation();

  return (
    <div>
      <>Current plan: {planLabel} </>
      {cancellation?.isCancelled && cancellation.date && (
        <>
          <span>(will end on </span>
          <LocalIsoDate date={cancellation.date} accuracy="day" />
          <span>)</span>
        </>
      )}
    </div>
  );
};
