import { nanoid } from "nanoid";
import { useRouter } from "next/router";
import { useRef } from "react";

import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showToast } from "@/src/features/notifications/showToast";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

const RELOAD_DELAY_MS = 500;

const productIdOf = (plan: CloudPlan) =>
  stripeProducts.find((product) => product.mappedPlan === plan)
    ?.stripeProductId;

/**
 * The four writes of the plan picker: start checkout, change plan, remove a
 * scheduled switch, remove a scheduled cancellation. Each reloads the page on
 * success, as the billing page reads the plan at load.
 */
export function usePlanChange(
  orgId: string | undefined,
  { onAfterReactivate }: { onAfterReactivate: () => void },
) {
  const router = useRouter();
  // One idempotency key per attempt at the billing provider: kept across retries, reset when it settles.
  const opId = useRef<string | null>(null);
  const nextOpId = () => {
    if (opId.current === null) opId.current = nanoid();
    return opId.current;
  };
  const settle = () => {
    opId.current = null;
  };
  const reloadSoon = () =>
    setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);

  const checkout = api.cloudBilling.createStripeCheckoutSession.useMutation({
    onSuccess: (url) => {
      settle();
      router.push(url);
    },
    onError: (error) => {
      settle();
      showToast({
        type: "ERROR",
        title: "Failed to start checkout session",
        analytics: classifyTrpcToastError(error, "billing_checkout.start"),
      });
    },
  });

  const change = api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
    onSuccess: () => {
      settle();
      showSuccessToast({
        operation: "billing_plan.change",
        title: "Plan changed successfully",
        description: "",
      });
      reloadSoon();
    },
    onError: (error) => {
      settle();
      showToast({
        type: "ERROR",
        title: "Failed to change plan",
        analytics: classifyTrpcToastError(error, "billing_plan.change"),
      });
    },
  });

  const keep = api.cloudBilling.clearPlanSwitchSchedule.useMutation({
    onSuccess: () => {
      settle();
      showSuccessToast({
        operation: "billing_plan.keep",
        title: "Kept current plan",
        description: "",
      });
      reloadSoon();
    },
    onError: (error) => {
      settle();
      showToast({
        type: "ERROR",
        title: "Failed to keep current plan",
        analytics: classifyTrpcToastError(error, "billing_plan.keep"),
      });
    },
  });

  const reactivate = api.cloudBilling.reactivateStripeSubscription.useMutation({
    onSuccess: () => {
      settle();
      showSuccessToast({
        operation: "subscription.reactivate",
        title: "Subscription reactivated",
        description: "",
      });
      reloadSoon();
      // Last, so tracking can never get in the way of the reactivation.
      onAfterReactivate();
    },
    onError: (error) => {
      settle();
      showToast({
        type: "ERROR",
        title: "Failed to reactivate subscription",
        analytics: classifyTrpcToastError(error, "subscription.reactivate"),
      });
    },
  });

  return {
    isProcessing:
      checkout.isPending ||
      change.isPending ||
      keep.isPending ||
      reactivate.isPending,
    startCheckout: (plan: CloudPlan) => {
      const stripeProductId = productIdOf(plan);
      if (!orgId || !stripeProductId) return;
      checkout.mutate({ orgId, stripeProductId, opId: nextOpId() });
    },
    changePlan: (plan: CloudPlan) => {
      const stripeProductId = productIdOf(plan);
      if (!orgId || !stripeProductId) return;
      change.mutate({ orgId, stripeProductId, opId: nextOpId() });
    },
    keepPlan: () => {
      if (!orgId) return;
      keep.mutate({ orgId, opId: nextOpId() });
    },
    reactivate: () => {
      if (!orgId) return;
      reactivate.mutate({ orgId, opId: nextOpId() });
    },
  };
}
