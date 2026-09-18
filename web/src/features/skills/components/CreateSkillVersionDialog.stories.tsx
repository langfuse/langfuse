import { type ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";

import { CreateSkillVersionDialog } from "./CreateSkillVersionDialog";
import { createSkillEditorStore } from "./skillEditorStore";

const defaultArgs = {
  store: createSkillEditorStore({
    name: "support-triage",
    baseVersion: 2,
    labels: ["production"],
    tags: ["support"],
    files: [
      {
        path: "SKILL.md",
        content: "# Support triage",
        contentType: "text/markdown",
        executable: false,
      },
    ],
  }),
  name: "support-triage",
  isFirstVersion: false,
  isSaving: false,
  onCancel: fn(),
  onConfirm: fn().mockResolvedValue(undefined),
} satisfies ComponentProps<typeof CreateSkillVersionDialog>;

const meta = preview.meta({
  component: CreateSkillVersionDialog,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <DialogContent>
          <Story />
        </DialogContent>
      </Dialog>
    ),
  ],
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
});
