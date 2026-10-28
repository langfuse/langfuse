import { type ReactNode } from "react";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

const dialogCopy: Record<
  PagerDutyTestTriggerStep,
  { title: string; text: string; toast: string }
> = {
  trigger: {
    title: "Send PagerDuty test event",
    text: "This opens a real info-severity test alert on the PagerDuty service, which may notify whoever is on call. Resolve it here once it arrives.",
    toast: "PagerDuty accepted the info test alert.",
  },
  escalate: {
    title: "Escalate PagerDuty test event",
    text: "This raises the test alert to critical, which pages whoever is on call at high urgency.",
    toast: "PagerDuty accepted the critical test alert.",
  },
};

/** PagerDutyTestEventDialogController warns that a test trigger may page whoever is on call, then sends it. */
export function PagerDutyTestEventDialogController({
  projectId,
  onSent,
  children,
}: {
  projectId: string;
  onSent: () => void;
  children: (control: {
    openDialog: (target: PagerDutyTestTriggerTarget) => void;
  }) => ReactNode;
}) {
  const sendTestEvent = api.automations.sendPagerDutyTestEvent.useMutation({
    meta: { silentAllErrors: true },
  });

  const handleConfirm = async (target: PagerDutyTestTriggerTarget) => {
    await sendTestEvent.mutateAsync({ projectId, ...target });
    onSent();
    showSuccessToast({
      operation: "automations.sendPagerDutyTestEvent",
      title: "Test event sent",
      description: dialogCopy[target.step].toast,
    });
  };

  return (
    <ConfirmationDialogController<PagerDutyTestTriggerTarget>
      title={(target) => dialogCopy[target.step].title}
      text={(target) => dialogCopy[target.step].text}
      confirmLabel="Send"
      variant="default"
      loading={sendTestEvent.isPending}
      error={sendTestEvent.error?.message}
      onAfterDismiss={() => sendTestEvent.reset()}
      onConfirm={handleConfirm}
    >
      {({ openDialog }) => children({ openDialog })}
    </ConfirmationDialogController>
  );
}

/** PagerDutyTestTriggerStep is a test event step that pages and therefore asks for confirmation. */
type PagerDutyTestTriggerStep = "trigger" | "escalate";

/** PagerDutyTestTriggerTarget is the step and the key it goes to: the typed key, else the action's stored key. */
export type PagerDutyTestTriggerTarget = {
  step: PagerDutyTestTriggerStep;
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
};
