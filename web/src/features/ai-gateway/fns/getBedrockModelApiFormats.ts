import { bedrockModelApiFormats } from "@/src/features/ai-gateway/constants/bedrockModelApiFormats";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

const INFERENCE_PROFILE_PREFIX = /^(us-gov|us|eu|apac|global|jp|au|ca|in)\./;
const ANTHROPIC_MODEL_PATTERN = /^anthropic\./;
const ALL_API_FORMATS: readonly GatewayApiFormat[] = [
  "anthropic.messages",
  "openai.responses",
  "openai.chat-completions",
];

/**
 * Returns the gateway API formats a Bedrock model serves on bedrock-runtime; an
 * empty list means none of them. Models missing from the model-card table stay
 * allowed: Anthropic ones on Messages, any other vendor on every format.
 */
export function getBedrockModelApiFormats(
  modelId: string,
): readonly GatewayApiFormat[] {
  const baseModelId = modelId.replace(INFERENCE_PROFILE_PREFIX, "");
  const known = findKnownApiFormats(baseModelId);
  if (known) return known;
  if (ANTHROPIC_MODEL_PATTERN.test(baseModelId)) return ["anthropic.messages"];
  return ALL_API_FORMATS;
}

// ListFoundationModels also returns context-window variants such as
// `<model-id>:200k`, which share the API support of their base model.
function findKnownApiFormats(modelId: string) {
  let candidate = modelId;
  let separatorIndex = candidate.length;
  while (separatorIndex !== -1) {
    candidate = candidate.slice(0, separatorIndex);
    const known = bedrockModelApiFormats.get(candidate);
    if (known) return known;
    separatorIndex = candidate.lastIndexOf(":");
  }
  return undefined;
}
