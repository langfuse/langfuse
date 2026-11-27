import preview from "../../../../.storybook/preview";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  FeaturePreviewModal,
  type FeaturePreviewModalProps,
} from "./FeaturePreviewModal";

function StatefulFeaturePreviewModal(args: FeaturePreviewModalProps) {
  const [, updateArgs] = useArgs<FeaturePreviewModalProps>();

  return (
    <FeaturePreviewModal
      {...args}
      onOpenChange={(open) => {
        updateArgs({ open });
        args.onOpenChange(open);
      }}
      state={Object.fromEntries(
        Object.entries(args.state).map(([flag, item]) => [
          flag,
          item
            ? {
                ...item,
                onToggle: (enabled: boolean) => {
                  updateArgs({
                    state: {
                      ...args.state,
                      [flag]: { ...item, enabled },
                    },
                  });
                  item.onToggle(enabled);
                },
              }
            : item,
        ]),
      )}
    />
  );
}

const meta = preview.meta({
  component: FeaturePreviewModal,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="bg-background flex min-h-screen items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    open: true,
    onOpenChange: fn(),
    state: {
      sessionViewV2: { enabled: false, onToggle: fn(), isToggling: false },
      sessionViewV2Timeline: { enabled: false, disabled: true, onToggle: fn() },
      unifiedTraceSessionView: { enabled: false, onToggle: fn() },
    },
  },
  render: StatefulFeaturePreviewModal,
});

export const Default = meta.story({});

export const Warning = meta.story({
  args: {
    state: {
      sessionViewV2: {
        enabled: false,
        warningReason:
          "This preview is enabled globally, so a per-user opt-out does not disable it.",
        onToggle: fn(),
      },
    },
  },
});

export const Loading = meta.story({
  args: {
    state: {
      sessionViewV2: { enabled: false, onToggle: fn(), isToggling: true },
    },
  },
});

export const SessionTimelineToggle = meta.story({
  name: "(Test) Session timeline toggle",
  render: FeaturePreviewModal,
  args: {
    open: true,
    onOpenChange: fn(),
    state: {
      sessionViewV2: { enabled: true, onToggle: fn() },
      sessionViewV2Timeline: { enabled: false, onToggle: fn() },
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const onTimelineToggle = args.state.sessionViewV2Timeline?.onToggle;
    if (!onTimelineToggle) {
      throw new Error("Expected sessionViewV2Timeline onToggle");
    }

    const timelineToggle = body.getByRole("switch", {
      name: "Toggle Session Timeline",
    });
    await expect(
      body.getByRole("link", { name: "Give feedback" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/orgs/langfuse/discussions/18687",
    );
    await userEvent.click(timelineToggle);

    await expect(onTimelineToggle).toHaveBeenCalledWith(true);
    await expect(
      body.queryByRole("button", { name: /Session Timeline/ }),
    ).not.toBeInTheDocument();
  },
});
