import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ModelFormDialogContent } from "./ModelFormDialogContent";

const meta = preview.meta({
  component: ModelFormDialogContent,
  args: {
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue({ id: "model-1" }),
    onCreated: fn(),
    onCancel: fn(),
  },
  render: (args) => (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <ModelFormDialogContent {...args} />}
    >
      {() => null}
    </DialogController>
  ),
});

export const Create = meta.story({
  args: {
    source: {
      action: "create",
      prefilledModelData: {
        modelName: "acme-chat-1",
        prices: { input: 0.000001, output: 0.000002 },
      },
    },
    title: "Create Model",
    description: "Create a new model configuration to track generation costs.",
  },
});

export const Edit = meta.story({
  args: {
    source: {
      action: "edit",
      modelData: {
        id: "model-1",
        scope: "PROJECT",
        projectId: "project-1",
        modelName: "acme-chat-1",
        matchPattern: "(?i)^(acme-chat-1)$",
        tokenizerId: null,
        tokenizerConfig: null,
        pricingTiers: [
          {
            id: "tier-1",
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: { input: 0.000001, output: 0.000002 },
          },
        ],
      },
    },
    title: "Edit Model",
    description: "acme-chat-1",
  },
});

export const CloneLangfuseDefaultToOrganization = meta.story({
  args: {
    source: {
      action: "clone",
      modelData: {
        id: "langfuse-gpt-4o",
        scope: "LANGFUSE",
        projectId: null,
        modelName: "gpt-4o",
        matchPattern: "(?i)^(openai/)?(gpt-4o)$",
        tokenizerId: "openai",
        tokenizerConfig: null,
        pricingTiers: [
          {
            id: "tier-1",
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: { input: 0.0000025, output: 0.00001 },
          },
        ],
      },
    },
    title: "Clone Model",
  },
});
