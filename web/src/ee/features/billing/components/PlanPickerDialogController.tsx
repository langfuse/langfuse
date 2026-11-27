import { type Plan } from "@langfuse/shared";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useRef } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";
import { isCloudPlan } from "@/src/ee/features/billing/fns/isCloudPlan";
import { usePlanChange } from "@/src/ee/features/billing/hooks/usePlanChange";
import { type PlanPickerSubscription } from "@/src/ee/features/billing/types/PlanPickerSubscription";
import { formatBillingDay } from "@/src/ee/features/billing/utils/formatBillingDate";
import {
  planDialogSourceFromQuery,
  withoutPlanDialogParams,
} from "@/src/ee/features/billing/utils/planDialogLink";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

import { PlanPickerDialog } from "./PlanPickerDialog";
import { useBillingInformation } from "./useBillingInformation";

type PlanPickerDialogControllerProps = {
  /** No plan change can start, so the picker does not open, by click or by link. */
  isDisabled: boolean;
  children: (control: { openDialog: () => void }) => ReactNode;
};

type Billing = ReturnType<typeof useBillingInformation>;

const pendingOf = (
  billing: Pick<Billing, "cancellation" | "scheduledPlanSwitch">,
): PlanPickerSubscription["pending"] => {
  if (billing.cancellation?.isCancelled) return { kind: "cancel" };
  const to = stripeProducts.find(
    (product) =>
      product.stripeProductId === billing.scheduledPlanSwitch?.newPlanId,
  )?.mappedPlan;
  return isCloudPlan(to) ? { kind: "switch", to } : null;
};

/**
 * Opens the plan picker for the organization, from the caller's trigger or
 * from a link (?plans=open), and runs the change it ends in.
 */
export function PlanPickerDialogController({
  isDisabled,
  children,
}: PlanPickerDialogControllerProps) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const billing = useBillingInformation();
  const { organization, billingProvider, planLabel, isLoading } = billing;
  const plan = (organization?.plan ?? null) as Plan | null;
  const eventContext = { plan, billingProvider };

  const planChange = usePlanChange(organization?.id, {
    onAfterReactivate: () =>
      capture("billing_cancellation:reactivation_confirmed", eventContext),
  });

  // A trial or a plan outside the Cloud plans has no row of its own: it is compared from the free plan.
  const currentPlan: CloudPlan = isCloudPlan(plan ?? undefined)
    ? (plan as CloudPlan)
    : "cloud:hobby";
  const hasSubscription = Boolean(billing.currentProductId);
  const subscription: PlanPickerSubscription = {
    hasSubscription,
    isLegacy: billing.isLegacySubscription,
    hasValidPaymentMethod: billing.hasValidPaymentMethod,
    trialPlanName: plan !== null && !isCloudPlan(plan) ? planLabel : null,
    periodEnd:
      hasSubscription && billing.billingPeriod
        ? formatBillingDay(billing.billingPeriod.end)
        : null,
    pending: hasSubscription ? pendingOf(billing) : null,
  };

  // A link opens the picker once billing has loaded, so it opens on the real plan.
  const isReady = router.isReady && !isLoading;
  const linkSource =
    isReady && !isDisabled ? planDialogSourceFromQuery(router.query) : null;
  const hasCapturedLinkOpen = useRef(false);
  useEffect(() => {
    if (!linkSource || hasCapturedLinkOpen.current) return;
    hasCapturedLinkOpen.current = true;
    // An effect that throws takes the page down, so tracking is guarded here.
    try {
      capture("project_settings:pricing_dialog_opened", {
        source: linkSource,
        plan,
      });
    } catch {}
  }, [linkSource, plan, capture]);

  return (
    <DialogController<{ source: string }>
      key={isReady ? "ready" : "loading"}
      initialState={() => (linkSource ? { source: linkSource } : undefined)}
      onDismiss={() => {
        if (!linkSource) return;
        router.replace(
          {
            pathname: router.pathname,
            query: withoutPlanDialogParams(router.query),
          },
          undefined,
          { shallow: true },
        );
      }}
      renderDialog={({ closeDialog }) => (
        <PlanPickerDialog
          onClose={closeDialog}
          currentPlan={currentPlan}
          subscription={subscription}
          isProcessing={planChange.isProcessing}
          onCheckout={planChange.startCheckout}
          onChangePlan={planChange.changePlan}
          onKeepPlan={planChange.keepPlan}
          onReactivate={planChange.reactivate}
          onAfterPickPlan={(targetPlan, direction) =>
            capture("billing_plan_picker:plan_selected", {
              ...eventContext,
              targetPlan,
              direction,
            })
          }
          onAfterOpenConfirm={(targetPlan, direction) =>
            capture("billing_plan_change:confirm_opened", {
              ...eventContext,
              targetPlan,
              direction,
            })
          }
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            openDialog({ source: "billing_page" });
            capture("project_settings:pricing_dialog_opened", {
              source: "billing_page",
              plan,
            });
          },
        })
      }
    </DialogController>
  );
}
