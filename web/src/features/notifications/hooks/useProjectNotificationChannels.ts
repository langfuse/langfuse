import { useState } from "react";

import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  TriggerEventSource,
  type AutomationDomain,
  type ProjectNotificationEventType,
} from "@langfuse/shared";

/** ProjectNotificationChannelsMode is the section's view: the channel list or the create/edit form. */
export type ProjectNotificationChannelsMode = "list" | "create" | "edit";

/**
 * useProjectNotificationChannels owns the data + navigation state for the
 * project-notification channels settings section. The create/edit form itself
 * is the reused <AutomationForm>, which owns its own mutations; this hook only
 * lists channels, deletes them, and tracks which view is shown plus the
 * one-time webhook secret reveal.
 */
export function useProjectNotificationChannels(projectId: string) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const { data: channels, isLoading } = api.automations.getAutomations.useQuery(
    { projectId, eventSource: TriggerEventSource.ProjectNotification },
    { enabled: Boolean(projectId) && hasAccess },
  );

  const [mode, setMode] = useState<ProjectNotificationChannelsMode>("list");
  const [editingChannel, setEditingChannel] = useState<AutomationDomain | null>(
    null,
  );
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

  const deleteChannel = api.automations.deleteAutomation.useMutation({
    onSuccess: () => utils.automations.getAutomations.invalidate({ projectId }),
  });

  const updateEventActions =
    api.automations.updateTriggerEventActions.useMutation({
      onSuccess: () =>
        utils.automations.getAutomations.invalidate({ projectId }),
    });

  /** isEventEnabled: an event is on when every channel has it enabled (toggles write to all channels, so states converge). */
  const isEventEnabled = (eventType: ProjectNotificationEventType): boolean =>
    Boolean(channels?.length) &&
    (channels ?? []).every((channel) =>
      (channel.trigger.eventActions as string[]).includes(eventType),
    );

  /** setEventEnabled applies the toggle to every channel's trigger.eventActions. */
  const setEventEnabled = (
    eventType: ProjectNotificationEventType,
    enabled: boolean,
  ) => {
    for (const channel of channels ?? []) {
      const current = channel.trigger
        .eventActions as unknown as ProjectNotificationEventType[];
      const next = enabled
        ? Array.from(new Set([...current, eventType]))
        : current.filter((event) => event !== eventType);
      updateEventActions.mutate({
        projectId,
        automationId: channel.id,
        eventActions: next,
      });
    }
  };

  return {
    hasAccess,
    channels,
    isLoading,
    mode,
    editingChannel,
    webhookSecret,
    isDeleting: deleteChannel.isPending,
    isTogglingEvent: updateEventActions.isPending,
    isEventEnabled,
    actions: {
      setEventEnabled,
      openCreate: () => {
        setEditingChannel(null);
        setMode("create");
      },
      openEdit: (channel: AutomationDomain) => {
        setEditingChannel(channel);
        setMode("edit");
      },
      closeForm: () => {
        setEditingChannel(null);
        setMode("list");
      },
      /** onFormSuccess returns to the list and, for a freshly created webhook, reveals the secret once. */
      onFormSuccess: (_automationId?: string, secret?: string) => {
        setEditingChannel(null);
        setMode("list");
        if (secret) setWebhookSecret(secret);
      },
      deleteChannel: (automationId: string) =>
        deleteChannel.mutate({ projectId, automationId }),
      dismissWebhookSecret: () => setWebhookSecret(null),
    },
  };
}
