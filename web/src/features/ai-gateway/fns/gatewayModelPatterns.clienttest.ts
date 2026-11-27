import { describe, expect, it } from "vitest";

import {
  describeGatewayModelPattern,
  matchesGatewayModelPatterns,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";

const models = [
  "openai:gpt-5",
  "openai:gpt-5-mini",
  "openai:o3-preview",
  "anthropic:claude-opus-4",
  "openrouter:meta-llama/llama-4-scout",
];

const allowed = (patterns: string[] | null) =>
  models.filter((model) => matchesGatewayModelPatterns(patterns, model));

describe("matchesGatewayModelPatterns", () => {
  it("allows the union of includes minus excludes on the full connection:model slug", () => {
    expect(allowed(null)).toEqual(models);
    expect(allowed(["openai:gpt-5"])).toEqual(["openai:gpt-5"]);
    expect(allowed(["gpt-5"])).toEqual([]);
    expect(allowed(["openai:*", "openrouter:*", "-*preview*"])).toEqual([
      "openai:gpt-5",
      "openai:gpt-5-mini",
      "openrouter:meta-llama/llama-4-scout",
    ]);
    expect(allowed(["*gpt*mini"])).toEqual(["openai:gpt-5-mini"]);
    expect(allowed(["-*opus*"])).toEqual(
      models.filter((model) => !model.includes("opus")),
    );
  });

  it("ignores case, like the pattern suggestions", () => {
    expect(allowed(["*GPT-5*", "-OpenAI:*Mini"])).toEqual(["openai:gpt-5"]);
  });

  it("describes what each pattern does", () => {
    expect(
      [
        "-openai:*",
        "openai:gpt-5",
        "anthropic:*opus*",
        "*mini*",
        "open*:o3",
        "*",
      ].map(describeGatewayModelPattern),
    ).toEqual([
      "Exclude all models from the openai connection",
      "Include gpt-5 from the openai connection",
      "Include models matching *opus* from the anthropic connection",
      "Include models matching *mini* from any connection",
      "Include models matching open*:o3",
      "Include all models",
    ]);
  });
});
