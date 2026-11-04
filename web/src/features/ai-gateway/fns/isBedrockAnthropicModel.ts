const ANTHROPIC_MODEL_PATTERN = /(^|\.)anthropic\./;

/**
 * Bedrock's model list carries no API format, so the model ID decides: Anthropic
 * models are served on the Messages route only, all others on the OpenAI routes.
 */
export function isBedrockAnthropicModel(modelId: string) {
  return ANTHROPIC_MODEL_PATTERN.test(modelId);
}
