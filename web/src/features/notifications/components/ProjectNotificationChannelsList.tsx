/* eslint-disable no-nested-ternary */
import { SiSlack } from "@langfuse/icons/si";
import { Webhook, Plus, Pencil, Trash2 } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { type AutomationDomain } from "@langfuse/shared";

const destinationLabel = (automation: AutomationDomain): string => {
  if (automation.action.type === "SLACK") {
    const config = automation.action.config;
    if (config.type !== "SLACK") return "Slack";
    return config.isPrivate
      ? `Slack ${config.channelName}`
      : `Slack #${config.channelName}`;
  }
  if (automation.action.type === "WEBHOOK") {
    const config = automation.action.config;
    return config.type === "WEBHOOK" ? `Webhook ${config.url}` : "Webhook";
  }
  return automation.action.type;
};

export type ProjectNotificationChannelsListProps = {
  channels: AutomationDomain[] | undefined;
  isLoading: boolean;
  isDeleting: boolean;
  onAdd: () => void;
  onEdit: (channel: AutomationDomain) => void;
  onDelete: (automationId: string) => void;
};

/**
 * ProjectNotificationChannelsList is the presentational list of configured
 * channels: props in, callbacks out. The create/edit form is the reused
 * <AutomationForm>, rendered by the container instead of this component.
 */
export function ProjectNotificationChannelsList({
  channels,
  isLoading,
  isDeleting,
  onAdd,
  onEdit,
  onDelete,
}: ProjectNotificationChannelsListProps) {
  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading channels...</p>
      ) : !channels || channels.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                {channel.action.type === "SLACK" ? (
                  <SiSlack size="base" />
                ) : (
                  <Webhook size="base" />
                )}
                <span
                  className="truncate text-sm font-bold"
                  title={destinationLabel(channel)}
                >
                  {destinationLabel(channel)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(channel)}
                  title="Edit channel"
                >
                  <Pencil size="base" color="default" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  onClick={() => onDelete(channel.id)}
                  title="Delete channel"
                >
                  <Trash2 size="base" color="default" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* One channel per project: adding is only offered while none exists. */}
      {!isLoading && !channels?.length && (
        <div>
          <Button variant="secondary" onClick={onAdd}>
            <Plus size="base" __rawClassName="mr-2" />
            Add channel
          </Button>
        </div>
      )}
    </div>
  );
}
