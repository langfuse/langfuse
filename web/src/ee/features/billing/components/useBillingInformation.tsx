import { useMemo } from "react";

import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { formatLocalIsoDate } from "@/src/components/LocalIsoDate";
import { planLabels } from "@langfuse/shared";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";

export type BillingCancellationInfo = {
  isCancelled: boolean;
  date: Date | null;
  formatted: string | null;
};

export type BillingScheduledSwitchInfo = {
  isScheduled: boolean;
  date: Date | null;
  formatted: string | null;
  newPlanLabel: string | null;
  scheduleId: string | undefined;
};

export type UseBillingInformationResult = {
  organization: ReturnType<typeof useQueryOrganization>;
  planLabel: string;
  cancellation: BillingCancellationInfo | null;
  scheduledPlanSwitch: BillingScheduledSwitchInfo | null;
  isLegacySubscription: boolean;
  hasActiveSubscription: boolean;
};

export const useBillingInformation = (): UseBillingInformationResult => {
  const organization = useQueryOrganization();

  const planLabel = useMemo(() => {
    return planLabels[organization?.plan ?? "cloud:hobby"];
  }, [organization]);

  const cancellation = useMemo<BillingCancellationInfo | null>(() => {
    const cancellationInfo =
      organization?.cloudConfig?.stripe?.cancellationInfo;
    if (
      !cancellationInfo?.scheduledForCancellation ||
      !cancellationInfo.cancelAt
    )
      return null;

    try {
      const cancelAt = cancellationInfo.cancelAt;
      const date =
        typeof cancelAt === "number" && !Number.isNaN(cancelAt)
          ? new Date(cancelAt * 1000)
          : null;

      if (!date || date.getTime() <= Date.now()) {
        return null;
      }

      const formatted = formatLocalIsoDate(date, false, "day");
      return { isCancelled: true, date, formatted };
    } catch {
      return null;
    }
  }, [organization]);

  const scheduledPlanSwitch = useMemo<BillingScheduledSwitchInfo | null>(() => {
    const scheduleInfo =
      organization?.cloudConfig?.stripe?.planSwitchScheduleInfo;
    if (!scheduleInfo?.switchAt) {
      return null;
    }

    try {
      const switchAt = scheduleInfo.switchAt;
      const date =
        typeof switchAt === "number" && !Number.isNaN(switchAt)
          ? new Date(switchAt * 1000)
          : null;

      if (!date || date.getTime() <= Date.now()) {
        return null;
      }

      const formatted = formatLocalIsoDate(date, false, "day");

      const newPlanId = scheduleInfo.productId;
      const product = newPlanId
        ? stripeProducts.find((p) => p.stripeProductId === newPlanId)
        : undefined;
      const newPlanLabel = product ? planLabels[product.mappedPlan] : null;

      return {
        isScheduled: true,
        date,
        formatted,
        newPlanLabel,
        scheduleId: scheduleInfo.subscriptionScheduleId,
      };
    } catch {
      return null;
    }
  }, [organization]);

  return {
    organization,
    planLabel,
    cancellation,
    scheduledPlanSwitch,
    isLegacySubscription:
      Boolean(organization?.cloudConfig?.stripe?.isLegacySubscription) === true,
    hasActiveSubscription:
      Boolean(organization?.cloudConfig?.stripe?.activeSubscriptionId) === true,
  };
};
