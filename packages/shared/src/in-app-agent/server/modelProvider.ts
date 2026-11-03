import { z } from "zod";

import { env } from "../../env";
import { logger } from "../../server/logger";
import {
  assertValidBedrockRegion,
  getLangfuseAIBedrockRegion,
} from "../../server/llm/ai-sdk/providers/bedrock";
import { toAnthropicBaseURL } from "../../server/llm/ai-sdk/providers/anthropic";
import {
  assertValidVertexLocation,
  getLangfuseAIVertexLocation,
} from "../../server/llm/ai-sdk/providers/vertex";
import { processOpenAIBaseURL } from "../../server/llm/utils";

export type LangfuseAIProvider = "bedrock" | "anthropic" | "openai" | "vertex";

type LangfuseAIHttpProviderConfig = {
  modelId: string;
  titleModelId: string;
  apiKey: string;
  baseURL?: string;
  extraHeaders?: Record<string, string>;
};

export type InAppAgentModelConfig =
  | {
      provider: "bedrock";
      modelId: string;
      titleModelId: string;
      region?: string;
    }
  | ({
      provider: "anthropic";
    } & LangfuseAIHttpProviderConfig)
  | ({
      provider: "openai";
    } & LangfuseAIHttpProviderConfig)
  | {
      provider: "vertex";
      modelId: string;
      titleModelId: string;
      location?: string;
    };

export const LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE =
  "Langfuse AI is not configured. Set LANGFUSE_AI_PROVIDER and LANGFUSE_AI_MODEL, plus LANGFUSE_AI_API_KEY when LANGFUSE_AI_PROVIDER is anthropic or openai.";

const extraHeadersRecordSchema = z.record(z.string(), z.string());

/**
 * Resolves the instance-wide Langfuse-operated AI model (Assistant + Ask AI).
 *
 * Callers should not branch on vendor beyond this discriminated config.
 * `LANGFUSE_AI_PROVIDER` selects `bedrock`, `anthropic`, `openai`, or
 * `vertex`. Unset provider is unconfigured, even when model variables and
 * `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` are set. Bedrock requires
 * `LANGFUSE_AI_PROVIDER=bedrock`.
 *
 * Bedrock and Vertex authenticate through the instance credential chain (the
 * AWS default chain / GCP application default credentials) and read no key.
 *
 * Region and location are optional: Cloud web historically omits the Bedrock
 * region and lets the AWS SDK use the task region, and an unset Vertex
 * location falls back to the "global" endpoint.
 *
 * LANGFUSE_AI_MODEL / LANGFUSE_AI_SMALL_MODEL / LANGFUSE_AI_AWS_BEDROCK_REGION
 * apply to all providers. LANGFUSE_AI_API_KEY / LANGFUSE_AI_BASE_URL /
 * LANGFUSE_AI_EXTRA_HEADERS apply to anthropic and openai.
 * LANGFUSE_AI_USE_RESPONSES_API applies to openai only.
 * LANGFUSE_AI_VERTEX_LOCATION applies to vertex only.
 */
export function getInAppAgentModelConfig(params?: {
  modelId?: string | null;
}): InAppAgentModelConfig | undefined {
  const provider = env.LANGFUSE_AI_PROVIDER;
  if (!provider) {
    return undefined;
  }

  if (provider === "anthropic" || provider === "openai") {
    return resolveHttpProviderConfig({ provider, modelId: params?.modelId });
  }

  const modelId = params?.modelId ?? env.LANGFUSE_AI_MODEL;

  if (!modelId) {
    return undefined;
  }

  if (provider === "vertex") {
    const location = getLangfuseAIVertexLocation();

    try {
      assertValidVertexLocation(location);
    } catch {
      return undefined;
    }

    warnIfInstanceCredentialsIgnoreKeyEnv("vertex");

    return {
      provider: "vertex",
      modelId,
      titleModelId: env.LANGFUSE_AI_SMALL_MODEL ?? modelId,
      location,
    };
  }

  const region = getLangfuseAIBedrockRegion();

  try {
    assertValidBedrockRegion(region);
  } catch {
    return undefined;
  }

  warnIfInstanceCredentialsIgnoreKeyEnv("bedrock");

  return {
    provider: "bedrock",
    modelId,
    titleModelId: env.LANGFUSE_AI_SMALL_MODEL ?? modelId,
    region,
  };
}

function resolveHttpProviderConfig(params: {
  provider: "anthropic" | "openai";
  modelId?: string | null;
}): InAppAgentModelConfig | undefined {
  const modelId = params.modelId ?? env.LANGFUSE_AI_MODEL;
  const apiKey = env.LANGFUSE_AI_API_KEY;

  if (!modelId || !apiKey) {
    return undefined;
  }

  const extraHeaders = parseLangfuseAIExtraHeaders();
  const titleModelId = env.LANGFUSE_AI_SMALL_MODEL ?? modelId;

  if (params.provider === "anthropic") {
    return {
      provider: "anthropic",
      modelId,
      titleModelId,
      apiKey,
      baseURL: toAnthropicBaseURL(env.LANGFUSE_AI_BASE_URL),
      ...(extraHeaders ? { extraHeaders } : {}),
    };
  }

  return {
    provider: "openai",
    modelId,
    titleModelId,
    apiKey,
    baseURL:
      processOpenAIBaseURL({
        url: env.LANGFUSE_AI_BASE_URL,
        modelName: modelId,
      }) ?? undefined,
    ...(extraHeaders ? { extraHeaders } : {}),
  };
}

function parseLangfuseAIExtraHeaders(): Record<string, string> | undefined {
  const raw = env.LANGFUSE_AI_EXTRA_HEADERS;
  if (!raw || raw.trim() === "") {
    return undefined;
  }

  const headers = extraHeadersRecordSchema.parse(JSON.parse(raw));
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Bedrock and Vertex authenticate through the instance credential chain, so the
 * key-bearing environment variables silently do nothing under them.
 */
function warnIfInstanceCredentialsIgnoreKeyEnv(provider: "bedrock" | "vertex") {
  const ignored: string[] = [];
  if (env.LANGFUSE_AI_API_KEY) {
    ignored.push("LANGFUSE_AI_API_KEY");
  }
  if (env.LANGFUSE_AI_BASE_URL) {
    ignored.push("LANGFUSE_AI_BASE_URL");
  }
  if (env.LANGFUSE_AI_EXTRA_HEADERS) {
    ignored.push("LANGFUSE_AI_EXTRA_HEADERS");
  }
  if (env.LANGFUSE_AI_USE_RESPONSES_API) {
    ignored.push("LANGFUSE_AI_USE_RESPONSES_API");
  }
  if (ignored.length === 0) {
    return;
  }

  const { label, credentialChain } =
    provider === "bedrock"
      ? {
          label: "Bedrock",
          credentialChain: "the instance AWS credential chain",
        }
      : {
          label: "Vertex AI",
          credentialChain: "GCP application default credentials",
        };

  logger.warn(
    `Ignoring ${ignored.join(" and ")} because the Langfuse AI provider is ${provider}. ${label} uses ${credentialChain}, not an API key, base URL, extra headers, or the OpenAI Responses API toggle.`,
  );
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
