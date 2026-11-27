import { withOpenOverlay } from "@/.storybook/decorators/withOpenOverlay";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionConflictDialog } from "./EvaluatorVersionConflictDialog";

const meta = preview.meta({
  component: EvaluatorVersionConflictDialog,
  decorators: [withOpenOverlay],
  parameters: {
    openOverlay: {
      onBeforeClose: ({ args }: { args: { isOverriding?: boolean } }) =>
        !args.isOverriding,
    },
  },
  render: (args) => <EvaluatorVersionConflictDialog {...args} />,
});

export const Default = meta.story({
  args: {
    isOverriding: false,
    onDiscard: fn(),
    onOverride: fn(),
  },
});

export const Overriding = meta.story({
  name: "(Test) Stays open while overriding",
  args: {
    isOverriding: true,
    onDiscard: fn(),
    onOverride: fn(),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByRole("dialog")).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(body.getByRole("dialog")).toBeVisible();
  },
});
