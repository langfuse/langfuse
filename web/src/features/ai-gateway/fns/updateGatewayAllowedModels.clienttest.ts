import { describe, expect, it } from "vitest";

import { updateGatewayAllowedModels } from "@/src/features/ai-gateway/fns/updateGatewayAllowedModels";

const models = ["gpt-4o", "gpt-4o-mini", "o3"];

describe("updateGatewayAllowedModels", () => {
  it("materializes the remaining catalog when models are disabled from allow-all", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: null,
        availableModels: models,
        targetModels: ["gpt-4o", "o3"],
        enabled: false,
      }),
    ).toEqual(["gpt-4o-mini"]);
  });

  it("keeps row edits explicit when every catalog model is enabled", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["gpt-4o"],
        availableModels: models,
        targetModels: ["gpt-4o-mini", "o3"],
        enabled: true,
      }),
    ).toEqual(models);
  });

  it("preserves allowed models outside the current provider catalog", () => {
    expect(
      updateGatewayAllowedModels({
        allowedModels: ["legacy-model", "gpt-4o"],
        availableModels: models,
        targetModels: ["gpt-4o"],
        enabled: false,
      }),
    ).toEqual(["legacy-model"]);
  });
});
