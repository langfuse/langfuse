import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/design-system/Button/Button";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorBulkDeleteDialogController } from "./EvaluatorBulkDeleteDialogController";

const meta = preview.meta({ component: EvaluatorBulkDeleteDialogController });

export const Selected = meta.story({
  name: "(Test) Selected",
  args: {
    children: ({ openDialog }) => (
      <Button
        text="Delete selected"
        onClick={() =>
          openDialog(
            { scope: "selected", evaluatorIds: ["evaluator-1"] },
            fn(async () => {}),
          )
        }
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Delete selected" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Delete selected evaluators?" },
    );
    await waitFor(() => expect(dialog).toBeVisible());
  },
});

export const AllMatching = meta.story({
  name: "(Test) All matching",
  args: {
    children: ({ openDialog }) => (
      <Button
        text="Delete all"
        onClick={() =>
          openDialog(
            { scope: "allMatching" },
            fn(async () => {}),
          )
        }
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Delete all" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Delete all matching evaluators?" },
    );
    await waitFor(() => expect(dialog).toBeVisible());
  },
});
