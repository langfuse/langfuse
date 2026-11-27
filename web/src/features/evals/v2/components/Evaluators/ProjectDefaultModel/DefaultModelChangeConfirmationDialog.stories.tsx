import { LLMAdapter } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/design-system/Button/Button";
import type { ComponentProps } from "react";

import preview from "../../../../../../../.storybook/preview";
import { DefaultModelChangeConfirmationDialog } from "./DefaultModelChangeConfirmationDialog";

const meta = preview.meta({ component: DefaultModelChangeConfirmationDialog });

const nextModel = {
  provider: "OpenAI",
  model: "gpt-4.1-mini",
  adapter: LLMAdapter.OpenAI,
  modelParams: {},
};

const defaultArgs = {
  currentModel: { provider: "OpenAI", model: "gpt-4.1" },
  loading: false,
  onConfirm: fn(async () => {}),
  children: ({ openDialog }) => (
    <Button text="Change model" onClick={() => openDialog(nextModel)} />
  ),
} satisfies ComponentProps<typeof DefaultModelChangeConfirmationDialog>;

export const UpdateDefault = meta.story({
  name: "(Test) Update default",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Change model" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Set project default model" },
    );
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole("button", { name: "Update default" }),
    ).toBeVisible();
    await expect(within(dialog).getByText("OpenAI / gpt-4.1")).toBeVisible();
    await expect(
      within(dialog).getByText("OpenAI / gpt-4.1-mini"),
    ).toBeVisible();
  },
});

export const SetDefault = meta.story({
  name: "(Test) Set default",
  args: {
    ...defaultArgs,
    currentModel: null,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Change model" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Set project default model" },
    );
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole("button", { name: "Set default" }),
    ).toBeVisible();
  },
});

export const Loading = meta.story({
  name: "(Test) Loading",
  args: {
    ...defaultArgs,
    loading: true,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Change model" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Set project default model" },
    );
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole("button", { name: "Update default" }),
    ).toBeDisabled();
  },
});
