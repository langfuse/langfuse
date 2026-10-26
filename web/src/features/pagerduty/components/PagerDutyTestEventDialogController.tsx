import { type ReactNode } from "react";

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
    openDialog: (integrationId: string) => void;
  }) => ReactNode;
}) {
  const sendTestEvent = api.pagerDuty.sendTestEvent.useMutation({
    meta: { silentAllErrors: true },
  });

  const handleConfirm = async (integrationId: string) => {
    await sendTestEvent.mutateAsync({ projectId, id: integrationId });
    showSuccessToast({
      operation: "pagerDuty.sendTestEvent",
      title: "Test event sent",
      description:
        "PagerDuty accepted the test event. Langfuse resolved it right away.",
    });
  };

  return (
    <ConfirmationDialogController<string>
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
