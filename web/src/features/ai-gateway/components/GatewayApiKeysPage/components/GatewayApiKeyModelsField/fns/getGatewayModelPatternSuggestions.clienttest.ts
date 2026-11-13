import { describe, expect, it } from "vitest";

import { getGatewayModelPatternSuggestions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/fns/getGatewayModelPatternSuggestions";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";

const enabledModels: GatewayEnabledModels = {
  models: [
    { slug: "openai:gpt-5", model: "gpt-5", provider: "OPENAI" },
    { slug: "openai:gpt-5-mini", model: "gpt-5-mini", provider: "OPENAI" },
    { slug: "azure:gpt-5", model: "gpt-5", provider: "OPENAI" },
  ],
  connections: [
    { name: "openai", isCatalogUnknown: false },
    { name: "azure", isCatalogUnknown: false },
    { name: "proxy", isCatalogUnknown: true },
  ],
};

const suggestedPatterns = (query: string, patterns: string[]) =>
  getGatewayModelPatternSuggestions(query, enabledModels, patterns).map(
    (suggestion) => suggestion.pattern,
  );

describe("getGatewayModelPatternSuggestions", () => {
  it("offers all enabled models only while no pattern is set", () => {
    expect(suggestedPatterns("", [])).toEqual([
      null,
      "openai:*",
      "azure:*",
      "proxy:*",
    ]);
    expect(suggestedPatterns("", ["azure:*"])).not.toContain(null);
  });

  it("skips models and connections the current exclude patterns remove", () => {
    expect(suggestedPatterns("", ["-openai:*", "-proxy:*"])).toEqual([
      "azure:*",
    ]);
    expect(suggestedPatterns("gpt", ["-*mini"])).toEqual([
      "openai:gpt-5",
      "azure:gpt-5",
      "*gpt*",
    ]);
  });

  it("suggests excluding a connection when only the exclude prefix is typed", () => {
    expect(suggestedPatterns("-", [])).toEqual([
      "-openai:*",
      "-azure:*",
      "-proxy:*",
    ]);
  });
});
