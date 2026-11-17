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

export const TestUsageModeAccessWarning = meta.story({
  name: "(Test) Warns that everyone with project access sees gateway traffic",
  args: SavedConfig.input.args,
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    const alert = within(dialog).getByRole("alert");
    await expect(alert).toHaveTextContent(
      "Everyone with project access sees gateway traffic",
    );
    await expect(alert).toHaveTextContent("organization member and viewer");
    await expect(alert).toHaveTextContent("costs, and gateway key owners");
    await expect(alert).not.toHaveTextContent("prompts and responses");
  },
});

export const TestFullModeAccessWarning = meta.story({
  name: "(Test) Full mode warning includes prompts and responses",
  args: {
    ...SavedConfig.input.args,
    config: {
      ...SavedConfig.input.args.config,
      ingestionMode: "FULL",
    },
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "prompts and responses",
    );
  },
});

export const TestNoAccessWarningWithoutRecording = meta.story({
  name: "(Test) No access warning when nothing is recorded",
  args: NotRecording.input.args,
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  },
});
