import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayApiKeyDialog } from "./GatewayApiKeyDialog";

const models = [
  ...[
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
    "o4-mini",
    "o3-deep-research-preview",
  ].map((model) => ({
    slug: `openai:${model}`,
    model,
    provider: "OPENAI" as const,
  })),
  ...["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"].map(
    (model) => ({
      slug: `anthropic:${model}`,
      model,
      provider: "ANTHROPIC" as const,
    }),
  ),
];
const enabledModels = {
  models,
  connections: [
    { name: "openai", isCatalogUnknown: false },
    { name: "anthropic", isCatalogUnknown: false },
  ],
};

const meta = preview.meta({
  component: GatewayApiKeyDialog,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Create gateway key",
    submitLabel: "Create key",
    canIssueServiceAccountKeys: true,
    enabledModels,
    errorMessage: null,
    isSubmitting: false,
    onSubmit: fn(),
  },
  render: (args) => <OpenDialog {...args} />,
});

function OpenDialog(props: ComponentProps<typeof GatewayApiKeyDialog>) {
  return (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <GatewayApiKeyDialog {...props} />}
    >
      {() => null}
    </DialogController>
  );
}

export const Default = meta.story({});

export const UserOnly = meta.story({
  args: { canIssueServiceAccountKeys: false },
});

export const WithoutModelsPreview = meta.story({
  args: { enabledModels: undefined },
});

export const WithError = meta.story({
  args: { errorMessage: "Gateway key name already exists." },
});

export const WithAllSections = meta.story({
  args: {
    defaultValues: {
      issuedAs: "user",
      name: "laptop",
      expiryPreset: "custom",
      customExpiry: "2099-01-01",
      metadata: [{ key: "team", value: "growth" }],
      modelPatterns: ["openai:*"],
      spendBudget: {
        interval: "MONTHLY",
        limitUsd: "250",
        alertThresholds: [85, 100],
      },
      sections: ["expiration", "spendBudget", "models", "metadata"],
    },
  },
});

export const SpendBudgetUnavailable = meta.story({
  args: {
    spendBudgetUnavailableReason:
      "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one.",
  },
});

const editArgs = {
  title: "Edit gateway key",
  submitLabel: "Save changes",
  disabledFields: ["issuedAs" as const, "expiration" as const],
  defaultValues: {
    issuedAs: "serviceAccount" as const,
    name: "backend-service",
    expiryPreset: "custom" as const,
    customExpiry: "2020-01-01",
    metadata: [{ key: "environment", value: "production" }],
    modelPatterns: ["openai:*", "-*mini*"],
    spendBudget: {
      interval: "MONTHLY" as const,
      limitUsd: "250",
      alertThresholds: [100 as const],
    },
    sections: [
      "expiration" as const,
      "spendBudget" as const,
      "models" as const,
      "metadata" as const,
    ],
  },
};

export const Edit = meta.story({ args: editArgs });

export const EditWithLockedSpendBudget = meta.story({
  args: {
    ...editArgs,
    disabledFields: [
      "issuedAs" as const,
      "expiration" as const,
      "spendBudget" as const,
    ],
  },
});
