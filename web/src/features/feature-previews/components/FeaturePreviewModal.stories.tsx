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
      modernSession: { enabled: false, onToggle: fn(), isToggling: false },
    },
  },
  render: StatefulFeaturePreviewModal,
});

export const Default = meta.story({});

export const Enabled = meta.story({
  args: {
    state: {
      modernSession: { enabled: true, onToggle: fn(), isToggling: false },
    },
  },
});

export const MultipleFeatures = meta.story({
  args: {
    state: {
      modernSession: { enabled: true, onToggle: fn(), isToggling: false },
      searchBar: { enabled: false, onToggle: fn(), isToggling: false },
    },
  },
});

export const Warning = meta.story({
  args: {
    state: {
      modernSession: {
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
      modernSession: { enabled: false, onToggle: fn(), isToggling: true },
    },
  },
});
