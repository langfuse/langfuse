import { expect, fn, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { createGatewayModelAccessStore } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/stores/createGatewayModelAccessStore";
import { GatewayConnectionModelsTable } from "./GatewayConnectionModelsTable";

const meta = preview.meta({ component: GatewayConnectionModelsTable });

function createModelAccess(allowedModels: string[] | null) {
  const modelAccessStore = createGatewayModelAccessStore(allowedModels);
  return {
    modelAccessStore,
    onToggleModel: fn((model: string, enabled: boolean) =>
      modelAccessStore.getState().actions.setOptimisticEnabled(model, enabled),
    ),
  };
}

const actions = {
  provider: "OPENAI" as const,
  isSaving: false,
  customModels: [],
  onRemoveCustomModel: fn(),
  onSetModelsEnabled: fn(),
};

export const Default = meta.story({
  args: {
    ...actions,
    ...createModelAccess([
      "claude-sonnet-4-5",
      "ft:gpt-4o-mini:acme::abc123",
      "gpt-4o",
    ]),
    models: [
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "ft:gpt-4o-mini:acme::abc123",
      "gpt-4o",
      "gpt-4o-mini",
    ],
    customModels: [{ id: "ft:gpt-4o-mini:acme::abc123" }],
  },
});

export const Empty = meta.story({
  args: {
    ...actions,
    ...createModelAccess(null),
    models: [],
  },
});

export const Saving = meta.story({
  args: {
    ...actions,
    ...createModelAccess(["gpt-4o"]),
    isSaving: true,
    models: ["gpt-4o", "gpt-4o-mini"],
  },
});

export const TogglesWhileSaving = meta.story({
  name: "(Test) Toggles while saving",
  args: {
    ...actions,
    ...createModelAccess(["gpt-4o"]),
    isSaving: true,
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch", { name: "Enable gpt-4o-mini" });

    await expect(toggle).toBeEnabled();
    await userEvent.click(toggle);

    await expect(args.onToggleModel).toHaveBeenCalledWith("gpt-4o-mini", true);
    await expect(
      canvas.getByRole("switch", { name: "Disable gpt-4o-mini" }),
    ).toBeChecked();
  },
});
