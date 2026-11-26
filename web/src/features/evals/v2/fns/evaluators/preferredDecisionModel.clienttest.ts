import { describe, expect, it } from "vitest";
import { LLMAdapter } from "@langfuse/shared";

import { getConnectionAvailableModels } from "@/src/features/llm-api-key/availableModels";

import { decisionModelsByProvider } from "./preferredDecisionModel";

// URL equivalence is pinned in typeSafeUpstream.test.ts; this file checks that
// both consumers go through it.
const connection = {
  adapter: LLMAdapter.TypeSafe,
  customModels: [] as string[],
  withDefaultModels: true,
};

describe("Nace Drex defaults on a decision-model connection", () => {
  it("getConnectionAvailableModels offers the Drex models for a non-canonical Nace URL", () => {
    const models = getConnectionAvailableModels({
      ...connection,
      baseURL: "https://CONSOLE.NACE.AI:443/v1/",
    });

    expect(models).toEqual(["drex-max", "drex-v2.0"]);
    expect(models).not.toContain("jev-latest");
  });

  it("decisionModelsByProvider offers the Drex models for a non-canonical Nace URL", () => {
    const models = decisionModelsByProvider([
      {
        ...connection,
        provider: "drex",
        baseURL: "https://CONSOLE.NACE.AI:443/v1/",
      },
    ]).get("drex");

    expect(models).toEqual(["drex-max", "drex-v2.0"]);
    expect(models).not.toContain("jev-latest");
  });

  it("getConnectionAvailableModels keeps jev-latest for a non-Nace URL", () => {
    expect(
      getConnectionAvailableModels({
        ...connection,
        baseURL: "https://openrouter.ai/api/v1",
      }),
    ).toEqual(["jev-latest"]);
  });

  it("decisionModelsByProvider keeps jev-latest for a non-Nace URL", () => {
    expect(
      decisionModelsByProvider([
        {
          ...connection,
          provider: "p",
          baseURL: "https://openrouter.ai/api/v1",
        },
      ]).get("p"),
    ).toEqual(["jev-latest"]);
  });

  it("keeps custom models and drops defaults when withDefaultModels is off", () => {
    expect(
      getConnectionAvailableModels({
        ...connection,
        baseURL: "https://console.nace.ai/v1/",
        customModels: ["drex-max-v1.1"],
        withDefaultModels: false,
      }),
    ).toEqual(["drex-max-v1.1"]);
  });
});
