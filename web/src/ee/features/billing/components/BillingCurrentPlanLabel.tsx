// Langfuse Cloud only

import { useMemo } from "react";

import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";

import { planLabels } from "@langfuse/shared";

export const BillingCurrentPlanLabel = () => {
  const organization = useQueryOrganization();

  const planLabel = useMemo(() => {
    // Note: We pick the plan off the organization object, which in turn
    // gets it from the current session.
    return planLabels[organization?.plan ?? "cloud:hobby"];
  }, [organization]);

  const scheduledForCancellationDate = useMemo(() => {
    const cancellationInfo =
      organization?.cloudConfig?.stripe?.cancellationInfo;

    if (!cancellationInfo) {
      return null;
    }

    if (!cancellationInfo.scheduledForCancellation) {
      return null;
    }

    if (!cancellationInfo.cancelAt) {
      return null;
    }

    try {
      const cancelAt = cancellationInfo.cancelAt;
      const cancelAtDate =
        typeof cancelAt === "number" && !Number.isNaN(cancelAt)
          ? new Date(cancelAt * 1000)
          : undefined;

      const inFuture = cancelAtDate
        ? cancelAtDate.getTime() > Date.now()
        : false;

      if (inFuture) {
        return cancelAtDate;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }, [organization]);

  return (
    <div>
      <>Current plan: {planLabel} </>
      {scheduledForCancellationDate && (
        <>
          <span>(will end on </span>
          <LocalIsoDate date={scheduledForCancellationDate} accuracy="day" />
          <span>)</span>
        </>
      )}
    </div>
  );
};
