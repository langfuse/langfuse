import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { AddCustomModelDialog } from "./AddCustomModelDialog";

const meta = preview.meta({
  component: AddCustomModelDialog,
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

const args = {
  existingModels: ["gpt-4o", "gpt-4o-mini"],
  isAdding: false,
  isTesting: false,
  onAdd: fn(async () => true),
  onAdded: fn(),
  onTest: fn(async () => ({ success: true as const })),
};

export const Empty = meta.story({ args });

export const AlreadyListed = meta.story({
  name: "(Test) Flags a model that is already listed",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(dialog.getByLabelText("Model ID"), "gpt-4o");
    await expect(
      dialog.getByText("This model is already listed."),
    ).toBeVisible();
  },
});

export const TestSucceeded = meta.story({
  name: "(Test) Shows a successful test request",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      dialog.getByLabelText("Model ID"),
      "ft:gpt-4o-mini:acme::abc123",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Send test request" }),
    );
    await expect(
      await dialog.findByText("The provider accepted the request"),
    ).toBeVisible();
  },
});

export const TestFailed = meta.story({
  name: "(Test) Shows the provider error for a failed test request",
  args: {
    ...args,
    onTest: fn(async () => ({
      success: false as const,
      error: "404: The model `ft:gpt-4o-mini:acme::typo` does not exist.",
    })),
  },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      dialog.getByLabelText("Model ID"),
      "ft:gpt-4o-mini:acme::typo",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Send test request" }),
    );
    await expect(
      await dialog.findByText("The test request failed"),
    ).toBeVisible();
  },
});

export const Adding = meta.story({
  args: { ...args, isAdding: true },
});
