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
      searchBar: { enabled: false, onToggle: fn(), isToggling: false },
    },
  },
  render: StatefulFeaturePreviewModal,
});

export const Default = meta.story({});

export const Warning = meta.story({
  args: {
    state: {
      searchBar: {
        enabled: false,
        warningReason:
          "The search bar appears on the new (v4) Observations and Traces tables. Turn on Fast (Preview) in the sidebar to use it after enabling this preview.",
        onToggle: fn(),
      },
    },
  },
});

export const Loading = meta.story({
  args: {
    state: {
      searchBar: { enabled: false, onToggle: fn(), isToggling: false },
    },
  },
});
