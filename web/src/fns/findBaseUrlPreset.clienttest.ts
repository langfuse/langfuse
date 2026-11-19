import { openAiBaseUrlPresets } from "@/src/constants/openAiBaseUrlPresets";
import { findBaseUrlPreset } from "@/src/fns/findBaseUrlPreset";

describe("findBaseUrlPreset", () => {
  it("maps a saved base URL to its preset, or to none for a custom URL", () => {
    expect(findBaseUrlPreset(openAiBaseUrlPresets, "")?.label).toBe("Default");
    expect(
      findBaseUrlPreset(openAiBaseUrlPresets, "https://api.openai.com/v1")
        ?.label,
    ).toBe("Default");
    expect(
      findBaseUrlPreset(openAiBaseUrlPresets, " https://eu.api.openai.com/v1/ ")
        ?.label,
    ).toBe("EU data residency");
    expect(
      findBaseUrlPreset(openAiBaseUrlPresets, "https://proxy.example.com/v1"),
    ).toBeUndefined();
  });
});
