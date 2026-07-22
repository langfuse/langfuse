import { useMemo } from "react";

import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { formatLocalIsoDate } from "@/src/components/LocalIsoDate";
import { type BillingProvider, type Plan, planLabels } from "@langfuse/shared";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { mapChbPlanCodeToStripeProductId } from "@/src/ee/features/billing/utils/chbCatalogue";
import { api } from "@/src/utils/api";

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
  newPlanId: string | null;
  scheduleId: string | undefined;
  message: string | null | undefined;
};

export type UseBillingInformationResult = {
  isLoading: boolean;
  organization: ReturnType<typeof useQueryOrganization>;
  planLabel: string;
  cancellation: BillingCancellationInfo | null;
  scheduledPlanSwitch: BillingScheduledSwitchInfo | null;
  isLegacySubscription: boolean;
  hasActiveSubscription: boolean;
  hasValidPaymentMethod: boolean;
  billingProvider: BillingProvider;
  /**
   * Stripe product id of the current paid plan, provider-agnostic: the real
   * product id for Stripe orgs, the mapped equivalent for CHB orgs. The plan
   * dialog keys its cards on Stripe product ids until plan-code-first inputs
   * ship.
   */
  currentProductId: string | null;
};

export const useBillingInformation = (): UseBillingInformationResult => {
  const organization = useQueryOrganization();
  const { data: subscriptionInfo, isLoading: isLoadingSubscriptionInfo } =
    api.cloudBilling.getSubscriptionInfo.useQuery(
      { orgId: organization?.id ?? "" },
      { enabled: Boolean(organization?.id) },
    );

  const planLabel = useMemo(() => {
    if (organization?.plan) {
      return planLabels[organization.plan as Plan];
    }
    return planLabels["cloud:hobby"];
  }, [organization]);

  const cancellation = useMemo<BillingCancellationInfo | null>(() => {
    const cancel = subscriptionInfo?.cancellation;
    if (!cancel) return null;
    try {
      const date =
        typeof cancel.cancelAt === "number" && !Number.isNaN(cancel.cancelAt)
          ? new Date(cancel.cancelAt * 1000)
          : null;
      if (!date || date.getTime() <= Date.now()) return null;
      const formatted = formatLocalIsoDate(date, false, "day");
      return { isCancelled: true, date, formatted };
    } catch {
      return null;
    }
  }, [subscriptionInfo]);

  const scheduledPlanSwitch = useMemo<BillingScheduledSwitchInfo | null>(() => {
    const sc = subscriptionInfo?.scheduledChange;
    if (!sc?.switchAt) return null;
    try {
      const date =
        typeof sc.switchAt === "number" && !Number.isNaN(sc.switchAt)
          ? new Date(sc.switchAt * 1000)
          : null;
      if (!date || date.getTime() <= Date.now()) return null;
      const formatted = formatLocalIsoDate(date, false, "day");
      const newPlanId = sc.newProductId;
      const product = newPlanId
        ? stripeProducts.find((p) => p.stripeProductId === newPlanId)
        : undefined;
      const newPlanLabel = product ? planLabels[product.mappedPlan] : null;
      return {
        isScheduled: true,
        date,
        formatted,
        newPlanLabel,
        newPlanId: newPlanId ?? null,
        scheduleId: sc.scheduleId,
        message: sc.message ?? null,
      };
    } catch {
      return null;
    }
  }, [subscriptionInfo]);

  // Server-resolved provider once loaded; before that, derive from the
  // session org's cloudConfig so gating does not flicker for CHB orgs.
  const billingProvider: BillingProvider =
    subscriptionInfo?.billingProvider ??
    (organization?.cloudConfig?.clickhouse?.organizationId
      ? "clickhouse"
      : "stripe");

  const chbPlanCode = organization?.cloudConfig?.clickhouse?.planCode;
  const currentProductId =
    organization?.cloudConfig?.stripe?.activeProductId ??
    (chbPlanCode ? mapChbPlanCodeToStripeProductId(chbPlanCode) : null);

  return {
    isLoading: isLoadingSubscriptionInfo,
    organization,
    planLabel,
    cancellation,
    scheduledPlanSwitch,
    isLegacySubscription: Boolean(
      organization?.cloudConfig?.stripe?.isLegacySubscription,
    ),
    hasActiveSubscription: Boolean(
      organization?.cloudConfig?.stripe?.activeSubscriptionId ??
      organization?.cloudConfig?.clickhouse?.bundleId,
    ),
    hasValidPaymentMethod: subscriptionInfo?.hasValidPaymentMethod ?? false,
    billingProvider,
    currentProductId,
  };
};
