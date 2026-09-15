import preview from "../../../../../.storybook/preview";
import { CustomTooltip } from "./CustomTooltip";

const meta = preview.meta({
  component: CustomTooltip,
  args: {
    children: () => null,
    content: <div>Structured content</div>,
    delay: 0,
  },
  render: (args) => (
    <CustomTooltip {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Show custom tooltip
        </button>
      )}
    </CustomTooltip>
  ),
});

export const Default = meta.story({
  args: {
    content: (
      <div className="space-y-1">
        <strong className="block">Structured content</strong>
        <span className="block">Tooltips can contain JSX.</span>
      </div>
    ),
    placement: "right",
  },
});
