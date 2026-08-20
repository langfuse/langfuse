import { env } from "../../env";
import { assertValidBedrockRegion } from "../../server/llm/ai-sdk/providers/bedrock";

export type InAppAgentModelConfig = {
  provider: "bedrock";
  modelId: string;
  titleModelId: string;
  region?: string;
};

/**
 * Resolves the instance-wide in-app agent model configuration.
 *
 * The discriminated provider contract is intentionally narrower than the
 * generic LLM connection model: in-app agent execution currently supports
 * Bedrock only, but callers do not need to know which provider supplies the
 * model. A future provider can add another branch here without changing the
 * worker or title-generation call sites.
 *
 * Region is optional: Cloud web historically omits LANGFUSE_AWS_BEDROCK_REGION
 * and lets the AWS SDK use the task region. Missing region must not treat the
 * model as unconfigured.
 */
export function getInAppAgentModelConfig(params?: {
  modelId?: string | null;
}): InAppAgentModelConfig | undefined {
  const modelId = params?.modelId ?? env.LANGFUSE_AWS_BEDROCK_MODEL;
  const region = env.LANGFUSE_AWS_BEDROCK_REGION;

  if (!modelId) {
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
 * Instance-wide in-app agent switch.
 *
 * Cloud is on unless LANGFUSE_IN_APP_AGENT_ENABLED is "false". Self-hosted is
 * on only when the var is "true".
 */
export function isInAppAgentInstanceEnabled(): boolean {
  const enabled = env.LANGFUSE_IN_APP_AGENT_ENABLED;

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return enabled !== "false";
  }

  return enabled === "true";
}
