import { SiSlack } from "react-icons/si";
import { Webhook, Plus, Pencil, Trash2, RotateCcw } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { JobConfigState, type AutomationDomain } from "@langfuse/shared";

const destinationLabel = (automation: AutomationDomain): string => {
  if (automation.action.type === "SLACK") {
    const config = automation.action.config;
    return config.type === "SLACK" ? `Slack #${config.channelName}` : "Slack";
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
  isReactivating: boolean;
  onAdd: () => void;
  onEdit: (channel: AutomationDomain) => void;
  onDelete: (automationId: string) => void;
  onReactivate: (automationId: string) => void;
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
  isReactivating,
  onAdd,
  onEdit,
  onDelete,
  onReactivate,
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
                  <SiSlack className="h-4 w-4 shrink-0" />
                ) : (
                  <Webhook className="h-4 w-4 shrink-0" />
                )}
                <span
                  className="truncate text-sm font-medium"
                  title={destinationLabel(channel)}
                >
                  {destinationLabel(channel)}
                </span>
                {channel.trigger.status === JobConfigState.INACTIVE && (
                  <StatusBadge type="disabled" className="shrink-0" />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {channel.trigger.status === JobConfigState.INACTIVE && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isReactivating}
                    onClick={() => onReactivate(channel.id)}
                    title="Re-enable channel"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(channel)}
                  title="Edit channel"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  onClick={() => onDelete(channel.id)}
                  title="Delete channel"
                >
                  <Trash2 className="h-4 w-4" />
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
            <Plus className="mr-2 h-4 w-4" />
            Add channel
          </Button>
        </div>
      )}
    </div>
  );
}
