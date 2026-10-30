import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { IngestionDialog } from "./IngestionDialog";

const meta = preview.meta({
  component: IngestionDialog,
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

const projects = [
  { id: "project-production", name: "Production" },
  { id: "project-gateway", name: "ai-gateway" },
];

export const SavedConfig = meta.story({
  args: {
    config: {
      organizationId: "org-1",
      ingestionMode: "USAGE",
      defaultIngestionProjectId: "project-gateway",
      defaultIngestionProject: {
        id: "project-gateway",
        orgId: "org-1",
        deletedAt: null,
      },
      createdAt: new Date("2026-10-01"),
      updatedAt: new Date("2026-10-01"),
    },
    projects,
    isSaving: false,
    onSave: fn(async () => true),
    onSaved: fn(),
  },
});

export const NotRecording = meta.story({
  args: {
    ...SavedConfig.input.args,
    config: {
      ...SavedConfig.input.args.config,
      ingestionMode: "NONE",
    },
  },
});

export const Saving = meta.story({
  args: {
    ...SavedConfig.input.args,
    isSaving: true,
  },
});

export const TestClosesOnlyAfterSave = meta.story({
  name: "(Test) Closes only after a successful save",
  args: {
    ...SavedConfig.input.args,
    onSave: fn(async () => false),
  },
  play: async ({ args }) => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
});
