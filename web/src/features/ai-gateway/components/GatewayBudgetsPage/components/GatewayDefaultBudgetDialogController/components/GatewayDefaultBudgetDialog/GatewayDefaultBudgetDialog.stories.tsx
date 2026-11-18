import { expect, fn, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayDefaultBudgetDialog } from "./GatewayDefaultBudgetDialog";

const meta = preview.meta({
  component: GatewayDefaultBudgetDialog,
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
  subject: "user" as const,
  spendLimit: null,
  errorMessage: null,
  isSubmitting: false,
  onSubmit: fn(),
  onRemove: fn(),
};

export const NoDefault = meta.story({
  name: "(Test) Offers no removal while no default is set",
  args,
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(
      dialog.queryByRole("button", { name: "Remove default" }),
    ).toBeNull();
  },
});

export const ExistingKeyDefault = meta.story({
  name: "(Test) Prefills and offers removing an existing default",
  args: {
    ...args,
    subject: "key",
    spendLimit: { interval: "MONTHLY", limitUsd: 10 },
  },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(dialog.getByLabelText("Amount (USD)")).toHaveValue("10");
    await expect(
      dialog.getByRole("button", { name: "Remove default" }),
    ).toBeEnabled();
  },
});

export const NotRecorded = meta.story({
  args: {
    ...args,
    unavailableReason:
      "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one.",
  },
});

export const SaveFailed = meta.story({
  args: {
    ...args,
    spendLimit: { interval: "MONTHLY", limitUsd: 10 },
    errorMessage: "Try again.",
  },
});
