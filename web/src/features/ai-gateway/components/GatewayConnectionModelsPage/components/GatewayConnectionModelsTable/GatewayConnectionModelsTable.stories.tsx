import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayConnectionModelsTable } from "./GatewayConnectionModelsTable";

const meta = preview.meta({ component: GatewayConnectionModelsTable });

const actions = {
  isSaving: false,
  customModels: [],
  onRemoveCustomModel: fn(),
  onEnableAll: fn(),
  onDisableAll: fn(),
  onSetEnabled: fn(),
};

export const Default = meta.story({
  args: {
    ...actions,
    models: [
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "ft:gpt-4o-mini:acme::abc123",
      "gpt-4o",
      "gpt-4o-mini",
    ],
    allowedModels: [
      "claude-sonnet-4-5",
      "ft:gpt-4o-mini:acme::abc123",
      "gpt-4o",
    ],
    customModels: ["ft:gpt-4o-mini:acme::abc123"],
  },
});

export const Empty = meta.story({
  args: {
    ...actions,
    models: [],
    allowedModels: null,
  },
});

export const Saving = meta.story({
  args: {
    ...actions,
    isSaving: true,
    models: ["gpt-4o", "gpt-4o-mini"],
    allowedModels: ["gpt-4o"],
  },
});
