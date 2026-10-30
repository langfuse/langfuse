import { useEffect, useRef, type ReactNode } from "react";

import { type ActionTypes } from "@langfuse/shared";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { showSuccessToast } from "@/src/features/notifications";
import {
  ConnectedNewMonitorAutomationDialog,
  type CreatedMonitorAutomation,
} from "./ConnectedNewMonitorAutomationDialog";
import { WebhookSecretDialog } from "./WebhookSecretDialog";

/** secretDialogDelayMs lets the create dialog finish its exit animation before the secret dialog enters. */
const secretDialogDelayMs = 200;

/** NewMonitorAutomationDialogController owns the create-automation dialog and the webhook secret dialog that follows it. */
export function NewMonitorAutomationDialogController({
  projectId,
  onCreated,
  children,
}: {
  projectId: string;
  onCreated?: (automationId: string) => void;
  children: (control: {
    openDialog: (draft?: NewMonitorAutomationDraft) => void;
  }) => ReactNode;
}) {
  const secretTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(secretTimer.current), []);

  return (
    <DialogController<CreatedWebhookSecret>
      renderDialog={({ state }) => (
        <WebhookSecretDialog
          automationName={state.automationName}
          webhookSecret={state.webhookSecret}
        />
      )}
    >
      {({ openDialog: openSecretDialog }) => (
        <DialogController<NewMonitorAutomationDraft>
          renderDialog={({ state, closeDialog }) => (
            <ConnectedNewMonitorAutomationDialog
              projectId={projectId}
              lockedActionType={state.actionType}
              onCreated={(automation) => {
                closeDialog();
                onCreated?.(automation.automationId);
                announceCreated(automation, (secret) => {
                  secretTimer.current = setTimeout(
                    () => openSecretDialog(secret),
                    secretDialogDelayMs,
                  );
                });
              }}
            />
          )}
        >
          {({ openDialog }) =>
            children({ openDialog: (draft = {}) => openDialog(draft) })
          }
        </DialogController>
      )}
    </DialogController>
  );
}

/** announceCreated shows a webhook's once-only secret, or a success toast for every other action. */
function announceCreated(
  automation: CreatedMonitorAutomation,
  showSecret: (secret: CreatedWebhookSecret) => void,
) {
  if (automation.webhookSecret) {
    showSecret({
      automationName: automation.name,
      webhookSecret: automation.webhookSecret,
    });
    return;
  }
  showSuccessToast({
    operation: "automation.create",
    title: "Automation Created",
    description: `Successfully created automation "${automation.name}".`,
  });
}

/** NewMonitorAutomationDraft opens the dialog with the picker, or locked to one action. */
export type NewMonitorAutomationDraft = { actionType?: ActionTypes };

/** CreatedWebhookSecret is the signing secret shown once after a webhook automation is created. */
type CreatedWebhookSecret = { automationName: string; webhookSecret: string };
