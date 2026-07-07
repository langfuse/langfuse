import {
  BEDROCK_CLAUDE_REASONING_MODEL_ID_PARTS,
  getBedrockReasoningProviderOptions,
  IN_APP_AGENT_REASONING_BUDGET_TOKENS,
} from "@/src/ee/features/in-app-agent/server/agent";

describe("getBedrockReasoningProviderOptions", () => {
  it.each(BEDROCK_CLAUDE_REASONING_MODEL_ID_PARTS)(
    "enables reasoning for Bedrock model ids containing %s",
    (modelIdPart) => {
      const modelId = `eu.${modelIdPart}20250101-v1:0`;

      expect(getBedrockReasoningProviderOptions(modelId)).toEqual({
        bedrock: {
          reasoningConfig: {
            type: "enabled",
            budgetTokens: IN_APP_AGENT_REASONING_BUDGET_TOKENS,
          },
        },
      });
    },
  );

  it("does not enable reasoning for Claude models without thinking support", () => {
    expect(
      getBedrockReasoningProviderOptions(
        "anthropic.claude-3-haiku-20240307-v1:0",
      ),
    ).toBeUndefined();
    expect(
      getBedrockReasoningProviderOptions(
        "anthropic.claude-3-5-sonnet-20240620-v1:0",
      ),
    ).toBeUndefined();
  });

  it("does not enable reasoning for an unrecognized future Claude generation", () => {
    // Anthropic's next flagship generation (e.g. a "sonnet-5") won't match any
    // entry in BEDROCK_CLAUDE_REASONING_MODEL_ID_PARTS until that constant is
    // updated. This test documents that current fallback behavior so it has
    // to be revisited deliberately when a new generation ships.
    expect(
      getBedrockReasoningProviderOptions(
        "anthropic.claude-sonnet-5-20260101-v1:0",
      ),
    ).toBeUndefined();
  });
});
