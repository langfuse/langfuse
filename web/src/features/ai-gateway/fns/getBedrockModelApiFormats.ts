import { bedrockModelApiFormats } from "@/src/features/ai-gateway/constants/bedrockModelApiFormats";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

const INFERENCE_PROFILE_PREFIX = /^(us-gov|us|eu|apac|global|jp|au|ca|in)\./;
const ANTHROPIC_MODEL_PATTERN = /^anthropic\./;

/**
 * Returns the gateway API formats a Bedrock model serves on bedrock-runtime; an
 * empty list means none of them. Models missing from the model-card table stay
 * allowed, routed by vendor: Anthropic to Messages, everything else to OpenAI.
 */
export function getBedrockModelApiFormats(
  modelId: string,
): readonly GatewayApiFormat[] {
  const baseModelId = modelId.replace(INFERENCE_PROFILE_PREFIX, "");
  const known = findKnownApiFormats(baseModelId);
  if (known) return known;
  if (ANTHROPIC_MODEL_PATTERN.test(baseModelId)) return ["anthropic.messages"];
  return ["openai.responses", "openai.chat-completions"];
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
