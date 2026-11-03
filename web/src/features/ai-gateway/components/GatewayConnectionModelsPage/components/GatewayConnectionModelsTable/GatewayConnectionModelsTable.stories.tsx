import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayConnectionModelsTable } from "./GatewayConnectionModelsTable";

const meta = preview.meta({ component: GatewayConnectionModelsTable });

const actions = {
  isSaving: false,
  onEnableAll: fn(),
  onDisableAll: fn(),
  onSetEnabled: fn(),
};

export const Default = meta.story({
  args: {
    ...actions,
    models: ["claude-haiku-4-5", "claude-sonnet-4-5", "gpt-4o", "gpt-4o-mini"],
    allowedModels: ["claude-sonnet-4-5", "gpt-4o"],
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
