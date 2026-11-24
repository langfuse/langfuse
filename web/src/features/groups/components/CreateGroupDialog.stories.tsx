import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { CreateGroupDialog } from "./CreateGroupDialog";

type CreateGroupDialogProps = Parameters<typeof CreateGroupDialog>[0];

/** Opens the dialog from a button, the way "New group" does. */
function CreateGroupDialogDemo(props: CreateGroupDialogProps) {
  return (
    <DialogController renderDialog={() => <CreateGroupDialog {...props} />}>
      {({ openDialog }) => (
        <Button onClick={() => openDialog()} text="New group" />
      )}
    </DialogController>
  );
}

const meta = preview.meta({
  component: CreateGroupDialogDemo,
  parameters: { layout: "centered" },
});

export const Default = meta.story({
  args: {
    roles: ["ADMIN", "MEMBER", "VIEWER", "NONE"],
    people: [
      {
        value: "ada",
        label: "Ada Lovelace",
        secondaryLabel: "ada@example.com",
      },
      {
        value: "grace",
        label: "Grace Hopper",
        secondaryLabel: "grace@example.com",
      },
      {
        value: "alan",
        label: "Alan Turing",
        secondaryLabel: "alan@example.com",
      },
    ],
    isPending: false,
    onSubmit: fn(),
  },
});

export const Saving = meta.story({
  args: { ...Default.input.args, isPending: true },
});

export const NameTaken = meta.story({
  args: {
    ...Default.input.args,
    error: "A group with this name already exists",
  },
});

export const TestCreatesInOneStep = meta.story({
  name: "(Test) Name, role and members are submitted together",
  args: Default.input.args,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "New group" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const create = dialog.getByRole("button", { name: "Create group" });
    await expect(create).toBeDisabled();

    await userEvent.type(dialog.getByLabelText("Name"), "Support leads");
    await userEvent.click(dialog.getByLabelText("Role in the organization"));
    await userEvent.click(await body.findByRole("option", { name: /^Viewer/ }));
    await userEvent.click(dialog.getByLabelText("Members"));
    await userEvent.click(await body.findByText("Grace Hopper"));
    await userEvent.click(await body.findByText("Alan Turing"));
    await userEvent.keyboard("{Escape}");
    await expect(dialog.getByText("2 members selected")).toBeVisible();

    await userEvent.click(create);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      displayName: "Support leads",
      role: "VIEWER",
      userIds: ["grace", "alan"],
    });
  },
});
