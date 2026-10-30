import { type ReactNode } from "react";
import { SiPagerduty, SiSlack } from "@langfuse/icons/si";
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
  if (automation.action.type === "PAGERDUTY") return "PagerDuty";
  return automation.action.type;
};

/** ChannelIcon renders the icon of a channel's action type. */
function ChannelIcon({ type }: { type: AutomationDomain["action"]["type"] }) {
  if (type === "SLACK") return <SiSlack size="base" />;
  if (type === "PAGERDUTY") return <SiPagerduty size="base" />;
  return <Webhook size="base" />;
}

export type ProjectNotificationChannelsListProps = {
  channels: AutomationDomain[] | undefined;
  isLoading: boolean;
  isDeleting: boolean;
  onAdd: () => void;
  onEdit: (channel: AutomationDomain) => void;
  onDelete: (automationId: string) => void;
};

function ChannelRows({
  channels,
  isDeleting,
  onEdit,
  onDelete,
}: {
  channels: AutomationDomain[];
  isDeleting: boolean;
  onEdit: (channel: AutomationDomain) => void;
  onDelete: (automationId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className="flex items-center justify-between gap-4 rounded-lg border p-4"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ChannelIcon type={channel.action.type} />
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
  );
}

function channelListContent({
  channels,
  isLoading,
  isDeleting,
  onEdit,
  onDelete,
}: Omit<ProjectNotificationChannelsListProps, "onAdd">): ReactNode {
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading channels...</p>;
  }
  if (!channels || channels.length === 0) return null;

  return (
    <ChannelRows
      channels={channels}
      isDeleting={isDeleting}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

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
      {channelListContent({
        channels,
        isLoading,
        isDeleting,
        onEdit,
        onDelete,
      })}

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
