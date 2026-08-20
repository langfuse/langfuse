import { getCurrentSpan } from "../../instrumentation";
import {
  BedrockConfigSchema,
  OpenAIConfigSchema,
  VertexAIConfigSchema,
  type LLMConnectionConfig,
} from "../../../interfaces/customLLMProviderConfigSchemas";
import { LLMValidationError } from "../errors";
import { LLMAdapter } from "../types";
import { translateAzureBaseURL } from "./providers/azure";
import { assertValidBedrockRegion } from "./providers/bedrock";
import type { OpenAIApiMode } from "./providers/openai";
import {
  assertValidAnthropicVertexModelName,
  assertValidVertexLocation,
  isClaudeModel,
} from "./providers/vertex";
import type { LLMCredentialSource } from "./providers/types";

export type AiSdkModelConfig = {
  adapter: LLMAdapter;
  /** Only set for the OpenAI adapter. */
  openAIApiMode?: OpenAIApiMode;
};

/**
 * Validates connection configuration before model construction. Every adapter
 * now runs on AI SDK, so unsupported configuration is a terminal caller error
 * rather than a reason to fall back to a second execution engine.
 */
export function resolveAiSdkModelConfig(params: {
  model: { adapter: LLMAdapter; id: string };
  connectionConfig?: LLMConnectionConfig | null;
  baseURL?: string | null;
  credentialSource: LLMCredentialSource;
}): AiSdkModelConfig {
  const { model, connectionConfig, baseURL, credentialSource } = params;

  try {
    if (
      credentialSource === "langfuse" &&
      model.adapter !== LLMAdapter.Bedrock
    ) {
      throw new LLMValidationError({
        code: "invalid-connection",
        message: "Langfuse credentials are only supported for Amazon Bedrock",
      });
    }

    switch (model.adapter) {
      case LLMAdapter.OpenAI: {
        const openAIConfig = OpenAIConfigSchema.parse(connectionConfig ?? {});

        return {
          adapter: model.adapter,
          // Chat Completions remains the default for OpenAI-compatible custom
          // base URLs. The Responses API is an explicit connection setting.
          openAIApiMode: openAIConfig.useResponsesApi
            ? "responses"
            : "chat-completions",
        };
      }

      case LLMAdapter.Azure: {
        const translatedBaseURL = translateAzureBaseURL(baseURL);
        if (!translatedBaseURL.ok) {
          throw new Error(translatedBaseURL.reason);
        }

        return { adapter: model.adapter };
      }

      case LLMAdapter.Bedrock: {
        if (credentialSource === "user") {
          const { region } = BedrockConfigSchema.parse(connectionConfig);
          assertValidBedrockRegion(region);
        }

        return { adapter: model.adapter };
      }

      case LLMAdapter.VertexAI: {
        const parsedConfig = connectionConfig
          ? VertexAIConfigSchema.parse(connectionConfig)
          : undefined;
        assertValidVertexLocation(parsedConfig?.location);
        if (isClaudeModel(model.id)) {
          assertValidAnthropicVertexModelName(model.id);
        }

        return { adapter: model.adapter };
      }

      case LLMAdapter.Anthropic:
      case LLMAdapter.GoogleAIStudio:
        return { adapter: model.adapter };

      default: {
        const _exhaustiveCheck: never = model.adapter;
        throw new Error(`Unsupported LLM adapter: ${_exhaustiveCheck}`);
      }
    }
  } catch (cause) {
    if (LLMValidationError.isInstance(cause)) throw cause;

    throw new LLMValidationError({
      code: "invalid-connection",
      message:
        cause instanceof Error
          ? cause.message
          : `Invalid ${model.adapter} connection configuration`,
      cause,
    });
  }
}

/** Records the now-unconditional AI SDK execution path on the active span. */
export function recordAiSdkExecution(params: {
  model: { adapter: LLMAdapter; id: string };
  modelConfig: AiSdkModelConfig;
}): void {
  const span = getCurrentSpan();
  if (!span) return;

  span.setAttribute("langfuse.llm.execution_engine", "ai-sdk");
  span.setAttribute("langfuse.llm.ai_sdk.adapter", params.model.adapter);
  if (params.modelConfig.openAIApiMode) {
    span.setAttribute(
      "langfuse.llm.openai.api_mode",
      params.modelConfig.openAIApiMode,
    );
  }
}
