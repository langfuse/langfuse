import { type ComponentProps } from "react";
import { fn, userEvent, within } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { AddDomainDialogController } from "./AddDomainDialogController";

const meta = preview.meta({
  component: AddDomainDialogController,
  args: {
    isSubmitting: false,
    onSubmitDomain:
      fn<
        ComponentProps<typeof AddDomainDialogController>["onSubmitDomain"]
      >().mockResolvedValue(undefined),
    children: ({ openDialog }) => (
      <Button type="button" size="sm" onClick={openDialog} text="Add Domain" />
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Add Domain" }),
    );
  },
});

export const Default = meta.story({});

export const Submitting = meta.story({
  args: {
    isSubmitting: true,
  },
});
