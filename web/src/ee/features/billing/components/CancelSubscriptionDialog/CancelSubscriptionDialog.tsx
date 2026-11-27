"use client";

import { useSession } from "next-auth/react";
import { type ComponentProps, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { SPEND_ALERTS_SECTION_ID } from "@/src/ee/features/billing/constants";
import { formatBillingDate } from "@/src/ee/features/billing/utils/formatBillingDate";
import {
  type CancelFlowStep,
  type CancellationFeedback,
  type CancellationNextStep,
  type CancellationReasonPlacement,
  cancellationNextStepContent,
  nextStepForReason,
  noCancellationReasonPicks,
  orderReasonsForUser,
  stepAfterReason,
  withCancellationReasonPick,
} from "@/src/ee/features/billing/utils/cancellationReasons";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

import { CancelSubscriptionConfirmStep } from "./CancelSubscriptionConfirmStep";
import { CancelSubscriptionNextStep } from "./CancelSubscriptionNextStep";
import {
  type CancelSubscriptionFormValues,
  CancelSubscriptionReasonStep,
} from "./CancelSubscriptionReasonStep";

/** A matched next step between the reason and the confirm. Off: the flow is two steps. */
const IS_NEXT_STEP_ENABLED = false;
const flowOptions = { isNextStepEnabled: IS_NEXT_STEP_ENABLED };

const CALL_URL = "https://cal.com/team/langfuse/welcome-to-langfuse";
const DOCS_URL = "https://langfuse.com/docs";

type DialogActions = NonNullable<ComponentProps<typeof Dialog>["actions"]>;

function openNextStep(nextStep: CancellationNextStep) {
  switch (nextStep) {
    case "spend_alert":
      document
        .getElementById(SPEND_ALERTS_SECTION_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    case "learn":
      window.open(DOCS_URL, "_blank", "noopener,noreferrer");
      return;
    case "call":
      window.open(CALL_URL, "_blank", "noopener,noreferrer");
      return;
  }
}

export function CancelSubscriptionDialog({
  isCancelling,
  onConfirm,
  closeDialog,
}: {
  isCancelling: boolean;
  /** Cancels the subscription with the reason the person gave and where it sat in their list. */
  onConfirm: (
    feedback: CancellationFeedback,
    shown: CancellationReasonPlacement,
  ) => void;
  closeDialog: () => void;
}) {
  const capture = usePostHogClientCapture();
  const { planLabel, billingProvider, billingPeriod, organization } =
    useBillingInformation();
  const form = useForm<CancelSubscriptionFormValues>({
    defaultValues: { reason: null, note: "" },
  });
  const [step, setStep] = useState<CancelFlowStep>("reason");
  const [picks, setPicks] = useState(noCancellationReasonPicks);
  const reason = useWatch({ control: form.control, name: "reason" });
  const nextStep = reason ? nextStepForReason(reason, flowOptions) : null;
  const eventContext = { plan: organization?.plan ?? null, billingProvider };
  const userId = useSession().data?.user?.id ?? "";
  const reasons = orderReasonsForUser(userId);
  const placement: CancellationReasonPlacement = {
    reasonPosition: reasons.findIndex((option) => option.id === reason) + 1,
    reasonOrder: reasons.map((option) => option.id).join(","),
  };

  const submitReason = () => {
    if (!reason) return;
    const hasNote = form.getValues("note").trim().length > 0;
    const next = stepAfterReason(reason, flowOptions);
    // The step moves first, so tracking can never hold the flow.
    setStep(next);
    capture("billing_cancellation:reason_submitted", {
      ...eventContext,
      ...placement,
      reason,
      hasNote,
      firstReason: picks.firstReason,
      reasonChangeCount: picks.reasonChangeCount,
    });
    if (next === "next_step") {
      capture("billing_cancellation:next_step_shown", {
        ...eventContext,
        reason,
        nextStep,
      });
    }
  };

  const acceptNextStep = () => {
    if (!reason || !nextStep) return;
    closeDialog();
    openNextStep(nextStep);
    capture("billing_cancellation:next_step_accepted", {
      ...eventContext,
      reason,
      nextStep,
    });
  };

  const declineNextStep = () => {
    if (!reason || !nextStep) return;
    setStep("confirm");
    capture("billing_cancellation:next_step_declined", {
      ...eventContext,
      reason,
      nextStep,
    });
  };

  const confirm = () => {
    if (!reason) return;
    onConfirm(
      { reason, note: form.getValues("note").trim() || undefined },
      placement,
    );
  };

  const reasonActions: DialogActions = [
    {
      label: "Continue",
      disabled: !reason,
      disabledReason: "Pick a reason to continue",
      onClick: submitReason,
    },
  ];
  const nextStepActions: DialogActions = [
    { label: "Back", variant: "secondary", onClick: () => setStep("reason") },
    { label: "No thanks", variant: "secondary", onClick: declineNextStep },
    {
      label: nextStep ? cancellationNextStepContent[nextStep].actionLabel : "",
      onClick: acceptNextStep,
    },
  ];
  const confirmActions: DialogActions = [
    {
      label: billingPeriod
        ? `Cancel on ${formatBillingDate(billingPeriod.end)}`
        : "Cancel subscription",
      variant: "destructive",
      loading: isCancelling,
      onClick: confirm,
    },
  ];

  switch (step) {
    case "reason":
      return (
        <Dialog
          title="Before you go, what's the main reason?"
          closeLabel={`Keep ${planLabel}`}
          actions={reasonActions}
        >
          <Dialog.Body>
            <CancelSubscriptionReasonStep
              control={form.control}
              reasons={reasons}
              onReasonPick={(picked) =>
                setPicks((current) =>
                  withCancellationReasonPick(current, picked),
                )
              }
            />
          </Dialog.Body>
        </Dialog>
      );
    case "next_step":
      return (
        <Dialog title="Before you go" hideCloseButton actions={nextStepActions}>
          <Dialog.Body>
            {reason && nextStep ? (
              <CancelSubscriptionNextStep reason={reason} nextStep={nextStep} />
            ) : null}
          </Dialog.Body>
        </Dialog>
      );
    case "confirm":
      return (
        <Dialog
          title={`Cancel ${planLabel}?`}
          closeLabel={`Keep ${planLabel}`}
          actions={confirmActions}
        >
          <Dialog.Body>
            <CancelSubscriptionConfirmStep />
          </Dialog.Body>
        </Dialog>
      );
  }
}
