import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayBudgetDialog } from "./GatewayBudgetDialog";

const meta = preview.meta({
  component: GatewayBudgetDialog,
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
  title: "Edit key budget",
  description: "Applies to requests with Search backend.",
  subject: "key" as const,
  spendLimit: { interval: "MONTHLY" as const, limitUsd: 10 },
  saveLabel: "Save changes",
  removeLabel: "Remove budget",
  errorMessage: null,
  isSubmitting: false,
  onSubmit: fn(),
  onRemove: fn(),
};

export const EditKeyBudget = meta.story({ args });

export const EditSeveralBudgets = meta.story({
  args: {
    ...args,
    title: "Edit 3 key budgets",
    description: "Each budget applies to requests with 3 keys.",
    warning:
      "2 of the selected keys already have a budget. Saving replaces them with this one.",
    removeLabel: "Use default budgets",
  },
});

export const NoDefault = meta.story({
  args: {
    ...args,
    title: "Default user budget",
    description:
      "Every user without their own budget gets this budget. It caps all of their gateway keys, in addition to each key's own budget.",
    subject: "user",
    spendLimit: null,
    saveLabel: "Save default",
    removeLabel: undefined,
  },
});

export const NotRecorded = meta.story({
  args: {
    ...args,
    unavailableReason:
      "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to change one.",
  },
});

export const SaveFailed = meta.story({
  args: { ...args, errorMessage: "Try again." },
});
