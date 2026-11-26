/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { ModernSessionSaveViewDialogContent } from "@/src/features/sessions/ModernSessionSaveViewDialogContent";
import { Dialog } from "@/src/components/ui/dialog";

const defaultArgs = {
  showOwnership: true,
  isSaving: false,
  allowedOwnerships: ["PRIVATE"],
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

export const ProjectView = meta.story({
  name: "(Test) Save project view",
  args: { ...defaultArgs, allowedOwnerships: ["PRIVATE", "PROJECT"] },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.type(
      body.getByRole("textbox", { name: "View name" }),
      "Shared review",
    );
    await userEvent.click(body.getByRole("radio", { name: "Project view" }));
    await userEvent.click(body.getByRole("button", { name: "Save view" }));
    await expect(args.onSave).toHaveBeenCalledWith("Shared review", "PROJECT");
  },
});

export const LegacyPreset = meta.story({
  name: "(Test) Save legacy project-shared preset",
  args: {
    ...defaultArgs,
    allowedOwnerships: ["PROJECT"],
    showOwnership: false,
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(body.queryByText("Private view")).not.toBeInTheDocument();
    await expect(body.queryByText(/Only you can see/)).not.toBeInTheDocument();
    await expect(body.queryByRole("radiogroup")).not.toBeInTheDocument();
    await userEvent.type(
      body.getByRole("textbox", { name: "View name" }),
      "Session filters",
    );
    await userEvent.click(body.getByRole("button", { name: "Save view" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      "Session filters",
      "PROJECT",
    );
  },
});
