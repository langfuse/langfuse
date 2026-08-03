import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { AutomationForm } from "@/src/features/automations/components/automationForm";
import { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
import { ProjectNotificationChannelsList } from "@/src/features/notifications/components/ProjectNotificationChannelsList";
import { useProjectNotificationChannels } from "@/src/features/notifications/hooks/useProjectNotificationChannels";
import { cn } from "@/src/utils/tailwind";
import {
  TriggerEventSource,
  type ActionTypes,
  type ProjectNotificationEventType,
} from "@langfuse/shared";

/** Project notifications route to webhooks or Slack; GitHub dispatch is not wired for this event source. */
const PROJECT_NOTIFICATION_ACTION_TYPES: ActionTypes[] = ["WEBHOOK", "SLACK"];

/** NOTIFIED_EVENTS lists the toggleable project-notification events, keyed by their eventType. */
const NOTIFIED_EVENTS: {
  value: ProjectNotificationEventType;
  title: string;
  description: string;
}[] = [
  {
    value: "blob-export-failed",
    title: "Blob storage export failed",
    description: "Sent when a scheduled blob storage export fails.",
  },
  {
    value: "evaluator-blocked",
    title: "Evaluator deactivated",
    description:
      "Sent when an evaluator is deactivated due to an unrecoverable error, such as a deleted model or LLM connection.",
  },
];

/**
 * ProjectNotificationChannels is the admin-only "Project Notifications"
 * settings section. It lists configured channels and delegates create/edit to
 * the shared <AutomationForm> scoped to the project-notification event source.
 */
export function ProjectNotificationChannels({
  projectId,
}: {
  projectId: string;
}) {
  const {
    hasAccess,
    channels,
    isLoading,
    mode,
    editingChannel,
    webhookSecret,
    isDeleting,
    isTogglingEvent,
    isEventEnabled,
    actions,
  } = useProjectNotificationChannels(projectId);

  const hasChannels = Boolean(channels?.length);

  if (!hasAccess) return null;

  return (
    <div>
      <Header title="Project Notifications" />
      <p className="text-muted-foreground mb-4 text-sm">
        Manage project notifications. Channel notifications are sent in addition
        to the admin emails.
      </p>

      {mode === "list" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <ProjectNotificationChannelsList
              channels={channels}
              isLoading={isLoading}
              isDeleting={isDeleting}
              onAdd={actions.openCreate}
              onEdit={actions.openEdit}
              onDelete={actions.deleteChannel}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold">Events</h3>
              <p className="text-muted-foreground text-sm">
                {hasChannels
                  ? "Choose which events are delivered to your channels."
                  : "Configure a channel above to enable project notifications."}
              </p>
            </div>
            {NOTIFIED_EVENTS.map((event) => (
              <div
                key={event.value}
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div
                  className={cn(
                    "flex flex-col gap-0.5",
                    !hasChannels && "opacity-50",
                  )}
                >
                  <p className="text-base font-bold">{event.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {event.description}
                  </p>
                </div>
                <Switch
                  checked={isEventEnabled(event.value)}
                  onCheckedChange={(checked) =>
                    actions.setEventEnabled(event.value, checked)
                  }
                  disabled={!hasChannels || isTogglingEvent}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <AutomationForm
          key={editingChannel?.id ?? "create"}
          projectId={projectId}
          isEditing
          lockedEventSource={TriggerEventSource.ProjectNotification}
          allowedActionTypes={PROJECT_NOTIFICATION_ACTION_TYPES}
          automation={editingChannel ?? undefined}
          onSuccess={actions.onFormSuccess}
          onCancel={actions.closeForm}
        />
      )}

      {/* One-time webhook secret reveal after creating a webhook channel. */}
      <Dialog
        open={Boolean(webhookSecret)}
        onOpenChange={(open) => {
          if (!open) actions.dismissWebhookSecret();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Webhook Secret Created</DialogTitle>
            <DialogDescription>
              Copy the webhook secret below — it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {webhookSecret && (
              <WebhookSecretRender webhookSecret={webhookSecret} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={actions.dismissWebhookSecret}>
              {"I've saved the secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
