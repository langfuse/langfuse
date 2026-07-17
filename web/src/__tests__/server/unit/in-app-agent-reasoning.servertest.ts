import { getBedrockReasoningProviderOptions } from "@/src/ee/features/in-app-agent/server/agent";

describe("getBedrockReasoningProviderOptions", () => {
  it("sends adaptive thinking with summarized display to Claude models by default", () => {
    // Adaptive thinking is the default for every Claude model, including
    // unrecognized future generations, so no model list needs maintenance.
    // The config must go through additionalModelRequestFields, not
    // reasoningConfig — @ai-sdk/amazon-bedrock overwrites
    // additionalModelRequestFields.thinking when reasoningConfig is set,
    // which would silently drop the summarized display and blank the
    // reasoning UI.
    for (const modelId of [
      "eu.anthropic.claude-opus-4-8",
      "us.anthropic.claude-sonnet-5",
      "eu.anthropic.claude-fable-5",
      "anthropic.claude-sonnet-6-20270101-v1:0",
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

  it("sends no thinking config for non-Claude models", () => {
    expect(
      getBedrockReasoningProviderOptions("meta.llama3-70b-instruct-v1:0"),
    ).toBeUndefined();
  });
});
