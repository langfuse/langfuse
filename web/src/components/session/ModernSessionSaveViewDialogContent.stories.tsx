import { type ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ModernSessionSaveViewDialogContent } from "@/src/components/session/ModernSessionSaveViewDialogContent";
import { Dialog } from "@/src/components/ui/dialog";

const defaultArgs = {
  isSaving: false,
  onCancel: fn(),
  onSave: fn(),
} satisfies ComponentProps<typeof ModernSessionSaveViewDialogContent>;

const meta = preview.meta({
  component: ModernSessionSaveViewDialogContent,
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <Story />
      </Dialog>
    ),
  ],
  parameters: { layout: "fullscreen" },
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
});

export const Saving = meta.story({
  args: {
    ...defaultArgs,
    isSaving: true,
  },
});
