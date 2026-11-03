import { type ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import {
  type PagerDutyTestEventState,
  type PagerDutyTestEventTarget,
} from "../hooks/usePagerDutyTestEvent";

/** PagerDutyTestEventDialogController warns that a test alert pages whoever is on call, then triggers it. */
export function PagerDutyTestEventDialogController({
  testEvent,
  children,
}: {
  testEvent: PagerDutyTestEventState;
  children: (control: {
    openDialog: (target: PagerDutyTestEventTarget) => void;
  }) => ReactNode;
}) {
  return (
    <ConfirmationDialogController<PagerDutyTestEventTarget>
      title="Send PagerDuty test event"
      text="This triggers a real critical test alert on the PagerDuty service and pages whoever is on call. Resolve it here once it arrives."
      confirmLabel="Send test event"
      variant="default"
      loading={testEvent.isSending}
      error={testEvent.sendError}
      onAfterDismiss={testEvent.onResetSend}
      onConfirm={testEvent.onSend}
    >
      {({ openDialog }) => children({ openDialog })}
    </ConfirmationDialogController>
  );
}
