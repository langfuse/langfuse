import preview from "../../../../.storybook/preview";
import { Tooltip } from "./Tooltip";

const meta = preview.meta({
  component: Tooltip,
  args: {
    children: () => null,
    delay: 0,
    label: "Additional context",
  },
  render: (args) => (
    <Tooltip {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Hover or focus me
        </button>
      )}
    </Tooltip>
  ),
});

export const Default = meta.story({});

export const DisabledTrigger = meta.story({
  args: {
    label: "This action is unavailable",
  },
  render: (args) => (
    <Tooltip {...args}>
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()}>
          <button type="button" disabled>
            Unavailable action
          </button>
        </span>
      )}
    </Tooltip>
  ),
});
