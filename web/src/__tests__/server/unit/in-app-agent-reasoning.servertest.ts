import { getBedrockReasoningProviderOptions } from "@/src/ee/features/in-app-agent/server/agent";

describe("getBedrockReasoningProviderOptions", () => {
  it("sends adaptive thinking with summarized display to models that reject thinking.enabled", () => {
    // Opus 4.7+, Sonnet 5, and Fable 5 return a 400 for thinking.type.enabled.
    // These ids also match the broader budget prefixes (e.g.
    // "anthropic.claude-opus-4-"), so this pins that the adaptive check runs
    // first. The config must go through additionalModelRequestFields, not
    // reasoningConfig — @ai-sdk/amazon-bedrock overwrites
    // additionalModelRequestFields.thinking when reasoningConfig is set,
    // which would silently drop the summarized display and blank the
    // reasoning UI.
    for (const modelId of [
      "eu.anthropic.claude-opus-4-8",
      "us.anthropic.claude-opus-4-7",
      "us.anthropic.claude-sonnet-5",
      "eu.anthropic.claude-fable-5",
    ]) {
      expect(getBedrockReasoningProviderOptions(modelId)).toEqual({
        bedrock: {
          additionalModelRequestFields: {
            thinking: { type: "adaptive", display: "summarized" },
          },
        },
      });
    }
  });

  it("sends budgeted extended thinking to older Claude models", () => {
    expect(
      getBedrockReasoningProviderOptions(
        "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
      ),
    ).toEqual({
      bedrock: {
        reasoningConfig: { type: "enabled", budgetTokens: 1024 },
      },
    });
  });

  it("sends no thinking config for unsupported or unrecognized models", () => {
    // Claude models without thinking support get no config, and neither does
    // an unrecognized future generation — the model id part lists in agent.ts
    // must be extended deliberately when a new generation ships.
    expect(
      getBedrockReasoningProviderOptions(
        "anthropic.claude-3-haiku-20240307-v1:0",
      ),
    ).toBeUndefined();
    expect(
      getBedrockReasoningProviderOptions(
        "anthropic.claude-sonnet-6-20270101-v1:0",
      ),
    ).toBeUndefined();
  });
});
