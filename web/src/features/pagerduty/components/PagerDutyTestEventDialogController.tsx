import { type ReactNode } from "react";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

/** PagerDutyTestEventDialogController warns that a test alert pages whoever is on call, then triggers it. */
export function PagerDutyTestEventDialogController({
  projectId,
  onSent,
  children,
}: {
  projectId: string;
  onSent: () => void;
  children: (control: {
    openDialog: (target: PagerDutyTestEventTarget) => void;
  }) => ReactNode;
}) {
  const sendTestEvent = api.automations.sendPagerDutyTestEvent.useMutation({
    meta: { silentAllErrors: true },
  });

  const handleConfirm = async (target: PagerDutyTestEventTarget) => {
    await sendTestEvent.mutateAsync({ projectId, ...target, step: "trigger" });
    onSent();
    showSuccessToast({
      operation: "automations.sendPagerDutyTestEvent",
      title: "Test event sent",
      description: "PagerDuty accepted the critical test alert.",
    });
  };

  return (
    <ConfirmationDialogController<PagerDutyTestEventTarget>
      title="Send PagerDuty test event"
      text="This triggers a real critical test alert on the PagerDuty service and pages whoever is on call. Resolve it here once it arrives."
      confirmLabel="Send test event"
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

/** PagerDutyTestEventTarget is the key a test event goes to: the typed key, else the action's stored key. */
export type PagerDutyTestEventTarget = {
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
};
