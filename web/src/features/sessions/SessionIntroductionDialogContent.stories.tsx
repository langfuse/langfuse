import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { Root as DialogRoot } from "@radix-ui/react-dialog";
import { SessionIntroductionDialogContent } from "@/src/features/sessions/SessionIntroductionDialogContent";

const meta = preview.meta({
  component: SessionIntroductionDialogContent,
  decorators: [
    (Story) => (
      <DialogRoot open onOpenChange={fn()}>
        <Story />
      </DialogRoot>
    ),
  ],
  parameters: { layout: "fullscreen" },
});

export default meta;

export const Default = meta.story({
  args: { onAfterButtonClick: fn() },
});
