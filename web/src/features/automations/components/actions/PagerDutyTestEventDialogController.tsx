import { type ReactNode } from "react";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

/** PagerDutyTestEventDialogController warns that a test event pages whoever is on call, then sends it. */
export function PagerDutyTestEventDialogController({
  projectId,
  children,
}: {
  projectId: string;
  children: (control: {
    openDialog: (target: PagerDutyTestEventTarget) => void;
  }) => ReactNode;
}) {
  const sendTestEvent = api.automations.sendPagerDutyTestEvent.useMutation({
    meta: { silentAllErrors: true },
  });

  const handleConfirm = async (target: PagerDutyTestEventTarget) => {
    await sendTestEvent.mutateAsync({ projectId, ...target });
    showSuccessToast({
      operation: "automations.sendPagerDutyTestEvent",
      title: "Test event sent",
      description:
        "PagerDuty accepted the test event. Langfuse resolved it right away.",
    });
  };

  return (
    <ConfirmationDialogController<PagerDutyTestEventTarget>
      title="Send PagerDuty test event"
      text="This triggers a real incident on the PagerDuty service and briefly pages whoever is on call. Langfuse resolves it right after."
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
type PagerDutyTestEventTarget = {
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
};
