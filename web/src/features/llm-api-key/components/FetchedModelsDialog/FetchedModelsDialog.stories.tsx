import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

import { FetchedModelsDialog } from "./FetchedModelsDialog";

// The dialog only renders inside a DialogController, which the form opens
// once the endpoint answered.
const renderDialog = (args: ComponentProps<typeof FetchedModelsDialog>) => (
  <DialogController renderDialog={() => <FetchedModelsDialog {...args} />}>
    {({ openDialog }) => (
      <button type="button" onClick={() => openDialog()}>
        Open dialog
      </button>
    )}
  </DialogController>
);

const openDialog = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: "Open dialog" }),
  );
  return within(canvasElement.ownerDocument.body);
};

const chooseTestModel = async (
  body: ReturnType<typeof within>,
  model: string,
) => {
  await userEvent.click(
    body.getByRole("combobox", { name: "Model used to test the connection" }),
  );
  await userEvent.click(await body.findByRole("option", { name: model }));
};

const meta = preview.meta({
  component: FetchedModelsDialog,
});

export default meta;

export const Default = meta.story({
  args: {
    configuredModels: [],
    fetchedModels: ["gpt-a", "gpt-b", "text-embedding-a"],
    onApply: fn(),
  },
  render: renderDialog,
});

export const WithConfiguredModels = meta.story({
  args: {
    configuredModels: ["kept-model", "retired-model"],
    fetchedModels: ["kept-model", "new-model"],
    onApply: fn(),
  },
  render: renderDialog,
});

export const KeepsConfiguredModels = meta.story({
  name: "(Test) Keeps configured models the endpoint no longer returns",
  args: {
    configuredModels: ["kept-model", "retired-model"],
    fetchedModels: ["kept-model", "new-model"],
    onApply: fn(),
  },
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = await openDialog(canvasElement);

    await expect(
      await body.findByText("Not returned by the endpoint"),
    ).toBeInTheDocument();
    await expect(body.getByText("New")).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Use 3 models" }));

    await expect(args.onApply).toHaveBeenCalledWith([
      "kept-model",
      "retired-model",
      "new-model",
    ]);
  },
});

export const SelectsFilteredModels = meta.story({
  name: "(Test) Selects or clears only the models matching the filter",
  args: {
    configuredModels: [],
    fetchedModels: ["gpt-a", "gpt-b", "other-model"],
    onApply: fn(),
  },
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = await openDialog(canvasElement);

    await userEvent.click(
      await body.findByRole("checkbox", { name: "Select all" }),
    );
    await expect(
      body.getByRole("button", { name: "Use 0 models" }),
    ).toBeInTheDocument();

    await userEvent.type(body.getByPlaceholderText("Search models"), "gpt");
    await userEvent.click(
      body.getByRole("checkbox", { name: "Select all shown" }),
    );
    await chooseTestModel(body, "gpt-a");
    await userEvent.click(body.getByRole("button", { name: "Use 2 models" }));

    await expect(args.onApply).toHaveBeenCalledWith(["gpt-a", "gpt-b"]);
  },
});

export const ChoosesTestModel = meta.story({
  name: "(Test) Puts the chosen test model first",
  args: {
    configuredModels: [],
    fetchedModels: ["embedding-model", "llama-chat"],
    onApply: fn(),
  },
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = await openDialog(canvasElement);

    // Without a configured model, nothing is tested until one is chosen.
    await expect(
      await body.findByRole("button", { name: "Use 2 models" }),
    ).toBeDisabled();

    await chooseTestModel(body, "llama-chat");
    await userEvent.click(body.getByRole("button", { name: "Use 2 models" }));

    await expect(args.onApply).toHaveBeenCalledWith([
      "llama-chat",
      "embedding-model",
    ]);
  },
});
