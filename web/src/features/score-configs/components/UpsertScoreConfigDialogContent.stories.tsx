import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";

import { UpsertScoreConfigDialogContent } from "./UpsertScoreConfigDialogContent";

const defaultArgs = {
  mode: "create",
  defaultValues: {
    dataType: "NUMERIC",
    minValue: undefined,
    maxValue: undefined,
    name: "",
  },
  onSubmit: fn().mockResolvedValue(undefined),
  onFormSuccess: fn(),
  isSubmitting: false,
} satisfies ComponentProps<typeof UpsertScoreConfigDialogContent>;

const meta = preview.meta({
  component: UpsertScoreConfigDialogContent,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <Story />
        </DialogContent>
      </Dialog>
    ),
  ],
});

export const Create = meta.story({
  args: defaultArgs,
});

export const Edit = meta.story({
  args: {
    ...defaultArgs,
    mode: "edit",
    defaultValues: {
      id: "config-1",
      name: "Answer quality",
      dataType: "NUMERIC",
      minValue: 0,
      maxValue: 1,
      description: "How well the answer addresses the question.",
    },
  },
});

export const Submitting = meta.story({
  args: {
    ...defaultArgs,
    isSubmitting: true,
  },
});

export const AddsCategories = meta.story({
  name: "(Test) Adds categories",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("combobox"));
    const categoricalOption = (await body.findAllByText("CATEGORICAL")).find(
      (element) => element.tagName !== "OPTION",
    );
    if (!categoricalOption) {
      throw new Error("Categorical data type option is not available.");
    }
    await userEvent.click(categoricalOption);
    await userEvent.click(body.getByRole("button", { name: "Add category" }));

    await expect(
      body.getByRole("button", { name: "Add category" }),
    ).toBeVisible();
    await expect(body.getAllByRole("textbox")).toHaveLength(6);
  },
});

export const SubmitsConfig = meta.story({
  name: "(Test) Submits config",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      body.getByRole("textbox", { name: "Name" }),
      "Answer quality",
    );
    await userEvent.click(body.getByRole("button", { name: "Submit" }));

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Answer quality",
        dataType: "NUMERIC",
      }),
    );
    await expect(args.onFormSuccess).toHaveBeenCalledOnce();
  },
});
