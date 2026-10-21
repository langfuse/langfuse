import { Info } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export const PrivateChannelsInfoTooltip = () => (
  <Tooltip label="Private channels are only listed for the person who connected Slack to this project, and only those they are a member of. Reconnect Slack to list your own private channels.">
    {({ getTriggerProps }) => (
      <IconButton
        {...getTriggerProps()}
        icon={Info}
        label="About private channels"
        size="sm"
        variant="ghost"
      />
    )}
  </Tooltip>
);
