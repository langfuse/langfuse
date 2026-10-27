import { AlertTriangle } from "@langfuse/icons";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DeleteProjectDialog,
  type DeleteProjectDialogProps,
} from "./DeleteProjectDialog";

const meta = preview.meta({
  component: DeleteProjectDialog,
});

export default meta;

const renderDialog = (args: DeleteProjectDialogProps) => (
  <DialogController
    initialState={() => true}
    renderDialog={() => <DeleteProjectDialog {...args} />}
  >
    {() => null}
  </DialogController>
);

export const Default = meta.story({
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
  render: renderDialog,
});

export const WithWarning = meta.story({
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
    children: (
      <Alert variant="warning" icon={AlertTriangle}>
        <Alert.Title>AI Gateway ingestion project</Alert.Title>
        <Alert.Description>
          <p>
            This project is the AI Gateway ingestion project of your
            organization. Deleting it sets the gateway ingestion mode to None.
          </p>
        </Alert.Description>
      </Alert>
    ),
  },
  render: renderDialog,
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      body.getByPlaceholderText("acme/my-project"),
      "acme/my-project",
    );
    await userEvent.click(body.getByRole("button", { name: "Delete project" }));

    await expect(args.onSubmit).toHaveBeenCalledOnce();
  },
});
