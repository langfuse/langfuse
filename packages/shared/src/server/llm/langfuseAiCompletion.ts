import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../interfaces/customLLMProviderConfigSchemas";
import { encrypt } from "../../encryption";
import { env } from "../../env";
import {
  getInAppAgentModelConfig,
  type InAppAgentModelConfig,
} from "../../in-app-agent/server/modelProvider";
import { resolveLangfuseAIOpenAICall } from "../../in-app-agent/server/openaiCompatibility";
import { type ChatMessage, LLMAdapter, type TraceSinkParams } from "./types";
import { generateLLMText, mapLegacyLLMCompletionParams } from "./llmText";
import { randomBytes } from "crypto";

export function isLangfuseAITracingConfigured() {
  return Boolean(env.LANGFUSE_AI_FEATURES_PROJECT_ID);
}

/** Product telemetry in the AI-features project. Eligible as an eval target. */
const LANGFUSE_AI_FEATURE_ENVIRONMENT = "production";

export function getLangfuseAITraceSinkParams(params: {
  feature: string;
  projectId: string;
  traceId?: string;
  traceName: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  prompt?: TraceSinkParams["prompt"];
}): TraceSinkParams | undefined {
  if (!env.LANGFUSE_AI_FEATURES_PROJECT_ID) {
    return undefined;
  }

  return {
    environment: LANGFUSE_AI_FEATURE_ENVIRONMENT,
    traceName: params.traceName,
    traceId: params.traceId ?? randomBytes(16).toString("hex"),
    targetProjectId: env.LANGFUSE_AI_FEATURES_PROJECT_ID,
    userId: params.userId,
    metadata: {
      langfuse_ai_feature: params.feature,
      langfuse_project_id: params.projectId,
      ...params.metadata,
    },
    prompt: params.prompt,
    aiFeatureOtelIngestion: true,
  };
}

export async function generateLangfuseAIText(params: {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  traceSinkParams?: TraceSinkParams;
  timeout?: number;
}): Promise<string> {
  const modelConfig = getInAppAgentModelConfig({ modelId: params.model });

  if (!modelConfig) {
    throw new Error("Langfuse AI completion model is not configured.");
  }

  const maxTokens: { max_tokens?: number } =
    params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {};

  const result = await generateLLMText({
    ...mapLegacyLLMCompletionParams(
      toLangfuseAICompletionParams({
        modelConfig,
        messages: params.messages,
        maxTokens,
      }),
    ),
    trace: params.traceSinkParams,
    timeout: params.timeout,
  });

  return result.text;
}

function toLangfuseAICompletionParams(params: {
  modelConfig: InAppAgentModelConfig;
  messages: ChatMessage[];
  maxTokens: { max_tokens?: number };
}) {
  const { modelConfig, messages, maxTokens } = params;

  switch (modelConfig.provider) {
    case "anthropic":
      return {
        messages,
        modelParams: {
          provider: "anthropic",
          adapter: LLMAdapter.Anthropic,
          model: modelConfig.modelId,
          ...maxTokens,
        },
        connection: {
          secretKey: encrypt(modelConfig.apiKey),
          baseURL: modelConfig.baseURL,
          ...encryptedExtraHeaders(modelConfig.extraHeaders),
        },
        credentialSource: "langfuse" as const,
      };
    case "openai": {
      const { apiMode } = resolveLangfuseAIOpenAICall({
        baseURL: modelConfig.baseURL,
        useResponsesApi: env.LANGFUSE_AI_USE_RESPONSES_API,
      });

      return {
        messages,
        modelParams: {
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          model: modelConfig.modelId,
          ...maxTokens,
        },
        connection: {
          secretKey: encrypt(modelConfig.apiKey),
          baseURL: modelConfig.baseURL,
          config: { useResponsesApi: apiMode === "responses" },
          ...encryptedExtraHeaders(modelConfig.extraHeaders),
        },
        credentialSource: "langfuse" as const,
      };
    }
    case "bedrock":
      return {
        messages,
        modelParams: {
          provider: "bedrock",
          adapter: LLMAdapter.Bedrock,
          model: modelConfig.modelId,
          // Intentionally omit temperature/top_p: newer Bedrock models reject these
          // inference params, while AI-feature generation works at model defaults.
          ...maxTokens,
        },
        connection: {
          secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
        },
        credentialSource: "langfuse" as const,
      };
    default: {
      const _exhaustive: never = modelConfig;
      throw new Error(
        `Unsupported Langfuse AI provider: ${(_exhaustive as InAppAgentModelConfig).provider}`,
      );
    }
  }
}

function encryptedExtraHeaders(
  extraHeaders: Record<string, string> | undefined,
): { extraHeaders: string } | Record<string, never> {
  return extraHeaders
    ? { extraHeaders: encrypt(JSON.stringify(extraHeaders)) }
    : {};
}
