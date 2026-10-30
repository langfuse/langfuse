import { type ReactNode } from "react";

import { type ActionTypes } from "@langfuse/shared";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { showSuccessToast } from "@/src/features/notifications";
import { WebhookSecretDialog } from "./components/WebhookSecretDialog";
import {
  ConnectedNewMonitorAutomationDialog,
  type CreatedMonitorAutomation,
} from "./ConnectedNewMonitorAutomationDialog";

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
  return (
    <WebhookSecretDialogController>
      {({ openSecretDialog }) => (
        <ConnectedNewMonitorAutomationDialogController
          projectId={projectId}
          onCreated={onCreated}
          openSecretDialog={openSecretDialog}
        >
          {children}
        </ConnectedNewMonitorAutomationDialogController>
      )}
    </WebhookSecretDialogController>
  );
}

/** WebhookSecretDialogController shows a webhook's once-only secret after the create dialog has closed. */
function WebhookSecretDialogController({
  children,
}: {
  children: (control: {
    openSecretDialog: (secret: CreatedWebhookSecret) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<CreatedWebhookSecret>
      renderDialog={({ state }) => (
        <WebhookSecretDialog
          automationName={state.automationName}
          webhookSecret={state.webhookSecret}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openSecretDialog: (secret) =>
            setTimeout(() => openDialog(secret), secretDialogDelayMs),
        })
      }
    </DialogController>
  );
}

/** ConnectedNewMonitorAutomationDialogController opens the create dialog and announces each automation it creates. */
function ConnectedNewMonitorAutomationDialogController({
  projectId,
  onCreated,
  openSecretDialog,
  children,
}: {
  projectId: string;
  onCreated?: (automationId: string) => void;
  openSecretDialog: (secret: CreatedWebhookSecret) => void;
  children: (control: {
    openDialog: (draft?: NewMonitorAutomationDraft) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<NewMonitorAutomationDraft>
      renderDialog={({ state, closeDialog }) => (
        <ConnectedNewMonitorAutomationDialog
          projectId={projectId}
          lockedActionType={state.actionType}
          onCreated={(automation) => {
            closeDialog();
            onCreated?.(automation.automationId);
            announceCreated(automation, openSecretDialog);
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({ openDialog: (draft = {}) => openDialog(draft) })
      }
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
