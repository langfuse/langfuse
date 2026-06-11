import preview from "../../../../.storybook/preview";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

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
      inAppAgent={{
        ...args.inAppAgent,
        onToggle: (enabled) => {
          updateArgs({
            inAppAgent: {
              ...args.inAppAgent,
              enabled,
            },
          });
          args.inAppAgent.onToggle(enabled);
        },
      }}
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
    inAppAgent: {
      enabled: true,
      onToggle: fn(),
      isToggling: false,
    },
  },
  render: StatefulFeaturePreviewModal,
});

export const Default = meta.story({});

export const Warning = meta.story({
  args: {
    inAppAgent: {
      enabled: false,
      warningReason:
        "The Assistant button is only shown inside a project. Open a project to use it after enabling the preview.",
      onToggle: fn(),
    },
  },
});

export const Loading = meta.story({
  args: {
    inAppAgent: {
      enabled: true,
      onToggle: fn(),
      isToggling: true,
    },
  },
});
