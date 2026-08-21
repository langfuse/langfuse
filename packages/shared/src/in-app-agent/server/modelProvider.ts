import { env } from "../../env";
import {
  assertValidBedrockRegion,
  getLangfuseAIBedrockRegion,
} from "../../server/llm/ai-sdk/providers/bedrock";
import { toAnthropicBaseURL } from "../../server/llm/ai-sdk/providers/anthropic";

export type LangfuseAIProvider = "bedrock" | "anthropic";

export type InAppAgentModelConfig =
  | {
      provider: "bedrock";
      modelId: string;
      titleModelId: string;
      region?: string;
    }
  | {
      provider: "anthropic";
      modelId: string;
      titleModelId: string;
      apiKey: string;
      baseURL?: string;
    };

export const LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE =
  "Langfuse AI model is not configured. Set LANGFUSE_AI_PROVIDER=anthropic with LANGFUSE_AI_MODEL and LANGFUSE_AI_API_KEY, or set LANGFUSE_AWS_BEDROCK_MODEL.";

/**
 * Resolves the instance-wide Langfuse-operated AI model (Assistant + Ask AI).
 *
 * Callers should not branch on vendor beyond this discriminated config. Cloud
 * always uses Bedrock. Self-hosted selects `LANGFUSE_AI_PROVIDER=bedrock|anthropic`.
 * Unset provider defaults to Bedrock when `LANGFUSE_AWS_BEDROCK_MODEL` is set.
 *
 * Region is optional for Bedrock: Cloud web historically omits it and lets
 * the AWS SDK use the task region. Prefer LANGFUSE_AI_AWS_BEDROCK_REGION;
 * LANGFUSE_AWS_BEDROCK_REGION is the fallback during the Cloud cutover.
 */
export function getInAppAgentModelConfig(params?: {
  modelId?: string | null;
}): InAppAgentModelConfig | undefined {
  if (resolveLangfuseAIProvider() === "anthropic") {
    const modelId = params?.modelId ?? env.LANGFUSE_AI_MODEL;
    const apiKey = env.LANGFUSE_AI_API_KEY;

    if (!modelId || !apiKey) {
      return undefined;
    }

    return {
      provider: "anthropic",
      modelId,
      titleModelId: env.LANGFUSE_AI_SMALL_MODEL ?? modelId,
      apiKey,
      baseURL: toAnthropicBaseURL(env.LANGFUSE_AI_BASE_URL),
    };
  }

  const modelId = params?.modelId ?? env.LANGFUSE_AWS_BEDROCK_MODEL;
  const region = getLangfuseAIBedrockRegion();

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

function resolveLangfuseAIProvider(): LangfuseAIProvider {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return "bedrock";
  }

  return env.LANGFUSE_AI_PROVIDER ?? "bedrock";
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
