import { expect, fn, userEvent, waitFor, within } from "storybook/test";

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

const MODEL_ID = "eu.anthropic.claude-opus-4-7";

const args = {
  existingModels: ["gpt-4o", "gpt-4o-mini"],
  isAdding: false,
  isTesting: false,
  onAdd: fn(async () => true),
  onAdded: fn(),
  onTest: fn(async () => ({ success: true as const, durationMs: 420 })),
};

const failedTestArgs = {
  ...args,
  onTest: fn(async () => ({
    success: false as const,
    status: "404 Not Found",
    error: `This credential cannot access ${MODEL_ID} in the selected region.`,
  })),
};

export const Empty = meta.story({ args });

export const BeforeTest = meta.story({
  name: "(Test) Requires a test request before adding",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(dialog.getByLabelText("Model ID"), MODEL_ID);
    await expect(
      dialog.getByText(
        "This model hasn't been tested with your credential yet.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add model" }),
    ).toBeDisabled();
  },
});

export const AlreadyListed = meta.story({
  name: "(Test) Flags a model that is already listed",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(dialog.getByLabelText("Model ID"), "gpt-4o");
    await expect(
      dialog.getByText("This model is already listed."),
    ).toBeVisible();
    // The disabled button ignores the pointer; its tooltip wrapper receives the hover.
    const addButtonWrapper = dialog.getByRole("button", {
      name: "Add model",
    }).parentElement;
    if (!addButtonWrapper) throw new Error("Add model wrapper not rendered");
    await userEvent.hover(addButtonWrapper);
    await waitFor(() =>
      expect(addButtonWrapper).toHaveAccessibleDescription(
        "This model is already listed.",
      ),
    );
  },
});

export const TestSucceeded = meta.story({
  name: "(Test) Enables adding after a successful test request",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(dialog.getByLabelText("Model ID"), MODEL_ID);
    await userEvent.click(
      dialog.getByRole("button", { name: "Send test request" }),
    );
    await expect(await dialog.findByText("Request accepted")).toBeVisible();
    await expect(
      dialog.getByText(
        "The provider responded in 420ms. This model is ready to add.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add model" }),
    ).toBeEnabled();
  },
});

export const TestFailed = meta.story({
  name: "(Test) Shows the provider error for a failed test request",
  args: failedTestArgs,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.type(dialog.getByLabelText("Model ID"), MODEL_ID);
    await userEvent.click(
      dialog.getByRole("button", { name: "Send test request" }),
    );
    await expect(
      await dialog.findByText("Request failed — 404 Not Found"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Test again" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add model" }),
    ).toBeDisabled();
  },
});

export const EditingClearsTestResult = meta.story({
  name: "(Test) Clears the test result when the model ID changes",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const input = dialog.getByLabelText("Model ID");
    await userEvent.type(input, MODEL_ID);
    await userEvent.click(
      dialog.getByRole("button", { name: "Send test request" }),
    );
    await dialog.findByText("Request accepted");
    await userEvent.type(input, "-v2");
    await expect(dialog.queryByText("Request accepted")).toBeNull();
    await expect(
      dialog.getByRole("button", { name: "Add model" }),
    ).toBeDisabled();
  },
});

export const Adding = meta.story({
  args: { ...args, isAdding: true },
});
