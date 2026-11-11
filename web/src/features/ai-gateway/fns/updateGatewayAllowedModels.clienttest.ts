import { describe, expect, it } from "vitest";

import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";

const models = ["gpt-4o", "gpt-4o-mini", "o3"];

describe("updateGatewayAllowedModels", () => {
  it("materializes the remaining catalog when models are disabled from allow-all", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: null,
        availableModels: models,
        catalogComplete: true,
        targetModels: ["gpt-4o", "o3"],
        enabled: false,
      }),
    ).toEqual(["gpt-4o-mini"]);
  });

  it("falls back to allow-all once every catalog model is enabled", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["gpt-4o"],
        availableModels: models,
        catalogComplete: true,
        targetModels: ["gpt-4o-mini", "o3"],
        enabled: true,
      }),
    ).toBeNull();
  });

  it("preserves allowed models outside the current provider catalog", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["legacy-model", "gpt-4o"],
        availableModels: models,
        catalogComplete: true,
        targetModels: ["gpt-4o"],
        enabled: false,
      }),
    ).toEqual(["legacy-model"]);
  });

  it("disables models outside the current provider catalog when every catalog model is disabled", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["legacy-model", "gpt-4o"],
        availableModels: models,
        catalogComplete: true,
        targetModels: models,
        enabled: false,
      }),
    ).toEqual([]);
  });

  it("keeps stored models the provider did not list when listing was denied", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["grok-4", "my-custom"],
        availableModels: ["my-custom"],
        catalogComplete: false,
        targetModels: ["my-custom"],
        enabled: false,
      }),
    ).toEqual(["grok-4"]);
  });
});
