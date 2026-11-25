import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { ComponentProps } from "react";
import preview from "../../../../../../../../../.storybook/preview";
import { RulesOverviewSelectionBarView } from "./RulesOverviewSelectionBarView";

const meta = preview.meta({ component: RulesOverviewSelectionBarView });

const defaultArgs = {
  selectedCount: 3,
  hasWriteAccess: true,
  statusChangePending: false,
  deletePending: false,
  onClear: fn(),
  onEnable: fn(),
  onDisable: fn(),
  onConfirmDelete: fn(async () => {}),
} satisfies ComponentProps<typeof RulesOverviewSelectionBarView>;

export const Default = meta.story({
  args: defaultArgs,
});

export const ReadOnly = meta.story({
  args: {
    ...defaultArgs,
    hasWriteAccess: false,
  },
});

export const DeleteConfirmation = meta.story({
  name: "(Test) Delete confirmation",
  args: {
    ...defaultArgs,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button", { name: "Delete" }));
    const dialog = await body.findByRole("dialog", {
      name: "Delete evaluation rules?",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByText(
        "This permanently deletes 3 rules and its evaluator assignments.",
      ),
    ).toBeVisible();
  },
});
