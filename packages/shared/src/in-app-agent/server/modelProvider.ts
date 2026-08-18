import { encrypt } from "../../encryption";
import { env } from "../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../interfaces/customLLMProviderConfigSchemas";
import { assertValidBedrockRegion } from "../../server/llm/ai-sdk/providers/bedrock";

export type InAppAgentModelConfig = {
  provider: "bedrock";
  modelId: string;
  titleModelId: string;
  region: string;
  authentication:
    | { type: "default-credentials" }
    | { type: "api-key"; apiKey: string };
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

  const apiKey = env.LANGFUSE_IN_APP_AGENT_BEDROCK_API_KEY;

  return {
    provider: "bedrock",
    modelId,
    titleModelId: env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL ?? modelId,
    region,
    authentication: apiKey
      ? { type: "api-key", apiKey }
      : { type: "default-credentials" },
  };
}

/**
 * Builds the encrypted connection value consumed by the shared LLM execution
 * boundary. The API key stays an environment secret and is never persisted.
 */
export function getInAppAgentModelConnectionSecret(
  config: InAppAgentModelConfig,
): string {
  return encrypt(
    config.authentication.type === "api-key"
      ? JSON.stringify({ apiKey: config.authentication.apiKey })
      : BEDROCK_USE_DEFAULT_CREDENTIALS,
  );
}
