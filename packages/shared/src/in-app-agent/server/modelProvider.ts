import { encrypt } from "../../encryption";
import { env } from "../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../interfaces/customLLMProviderConfigSchemas";
import { assertValidBedrockRegion } from "../../server/llm/ai-sdk/providers/bedrock";

export type InAppAgentModelConfig = {
  provider: "bedrock";
  modelId: string;
  titleModelId: string;
  region: string;
};

/**
 * Resolves the instance-wide assistant model configuration.
 *
 * The discriminated provider contract is intentionally narrower than the
 * generic LLM connection model: assistant execution currently supports
 * Bedrock only, but callers do not need to know which provider supplies the
 * model. A future provider can add another branch here without changing the
 * worker or title-generation call sites.
 */
export function getInAppAgentModelConfig(params?: {
  modelId?: string | null;
}): InAppAgentModelConfig | undefined {
  const modelId = params?.modelId ?? env.LANGFUSE_AWS_BEDROCK_MODEL;
  const region = env.LANGFUSE_AWS_BEDROCK_REGION;

  if (!modelId || !region) {
    return undefined;
  }

  assertValidBedrockRegion(region);

  return {
    provider: "bedrock",
    modelId,
    titleModelId: env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL ?? modelId,
    region,
  };
}

/**
 * Builds the encrypted connection value consumed by the shared LLM execution
 * boundary. Assistant Bedrock calls always use the AWS default credential
 * chain; its resolved credentials are never persisted.
 */
export function getInAppAgentModelConnectionSecret(): string {
  return encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS);
}
