import { describe, expect, it } from "vitest";

import { getGatewayModelPatternSuggestions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/fns/getGatewayModelPatternSuggestions";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const enabledModels: GatewayEnabledModel[] = [
  { slug: "openai:gpt-5", model: "gpt-5", provider: "OPENAI" },
  { slug: "openai:gpt-5-mini", model: "gpt-5-mini", provider: "OPENAI" },
  { slug: "azure:gpt-5", model: "gpt-5", provider: "OPENAI" },
];

const suggestedPatterns = (query: string, patterns: string[]) =>
  getGatewayModelPatternSuggestions(query, enabledModels, patterns).map(
    (suggestion) => suggestion.pattern,
  );

describe("getGatewayModelPatternSuggestions", () => {
  it("skips models and connections the current exclude patterns remove", () => {
    expect(suggestedPatterns("", ["-openai:*"])).toEqual([null, "azure:*"]);
    expect(suggestedPatterns("gpt", ["-*mini"])).toEqual([
      "openai:gpt-5",
      "azure:gpt-5",
      "*gpt*",
    ]);
  });
});
