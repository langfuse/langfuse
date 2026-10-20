import { Info } from "@langfuse/icons";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export const PrivateChannelsInfoTooltip = () => (
  <Tooltip label="Private channels are only listed for the person who connected Slack to this project, and only those they are a member of. Reconnect Slack to list your own private channels.">
    {({ getTriggerProps }) => (
      <button
        type="button"
        {...getTriggerProps()}
        aria-label="About private channels"
      >
        <Info aria-hidden size="base" color="muted" />
      </button>
    )}
  </Tooltip>
);
