import { createAmazonBedrock } from "ai-sdk-amazon-bedrock-v4";
import { createAnthropic } from "ai-sdk-anthropic-v4";
import { createOpenAICompatible } from "ai-sdk-openai-compatible-v4";
import { createOpenAI } from "ai-sdk-openai-v4";

import type { InAppAgentModelConfig } from "@langfuse/shared/in-app-agent/server/modelProvider";
import {
  isOpenAICompatibleEndpoint,
  resolveLangfuseAIOpenAICall,
} from "@langfuse/shared/in-app-agent/server/openaiCompatibility";
import { env } from "@langfuse/shared/src/env";
import { createDefaultBedrockProviderAuth } from "@langfuse/shared/src/server";

const BEDROCK_CLAUDE_MODEL_ID_PART = "anthropic.claude";
const ANTHROPIC_CLAUDE_MODEL_ID_PART = "claude";

export type InAppAgentLanguageModel = ReturnType<
  ReturnType<typeof createAmazonBedrock>
>;

export function createInAppAgentLanguageModel(params: {
  config: InAppAgentModelConfig;
  awsProfile?: string;
}): InAppAgentLanguageModel {
  switch (params.config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: params.config.apiKey,
        baseURL: params.config.baseURL,
        ...(params.config.extraHeaders
          ? { headers: params.config.extraHeaders }
          : {}),
      });

      return anthropic(
        params.config.modelId as Parameters<typeof anthropic>[0],
      ) as InAppAgentLanguageModel;
    }
    case "openai": {
      return createOpenAIInAppAgentLanguageModel(
        params.config,
      ) as InAppAgentLanguageModel;
    }
    case "bedrock": {
      const bedrock = createAmazonBedrock({
        ...(params.config.region ? { region: params.config.region } : {}),
        ...createDefaultBedrockProviderAuth(
          params.awsProfile ? { profile: params.awsProfile } : undefined,
        ),
      });

      return bedrock(params.config.modelId as Parameters<typeof bedrock>[0]);
    }
    default: {
      const _exhaustive: never = params.config;
      throw new Error(
        `Unsupported Langfuse AI provider: ${(_exhaustive as InAppAgentModelConfig).provider}`,
      );
    }
  }
}

function createOpenAIInAppAgentLanguageModel(config: {
  modelId: string;
  apiKey: string;
  baseURL?: string;
  extraHeaders?: Record<string, string>;
}) {
  const { apiMode } = resolveLangfuseAIOpenAICallFromEnv(config.baseURL);
  const extraHeaders = config.extraHeaders
    ? { headers: config.extraHeaders }
    : {};

  // Match Ask AI / playground: custom OpenAI-compatible URLs use the
  // compatible Chat Completions client so OpenAI chat heuristics do not
  // run on a Claude (or other) model id behind a gateway.
  if (
    apiMode === "chat-completions" &&
    isOpenAICompatibleEndpoint(config.baseURL)
  ) {
    const openaiCompatible = createOpenAICompatible({
      name: "openai",
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      ...extraHeaders,
    });

    return openaiCompatible.languageModel(config.modelId);
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...extraHeaders,
  });

  return apiMode === "responses"
    ? openai.responses(config.modelId)
    : openai.chat(config.modelId);
}

// Adaptive thinking is the default for every Claude model so new generations
// work without maintaining a model list. Older models that only support
// thinking.type.enabled (e.g. haiku 4.5) reject adaptive with a 400 — the
// in-app agent must run on a model generation that supports it.
export function getBedrockReasoningProviderOptions(modelId: string) {
  if (!modelId.includes(BEDROCK_CLAUDE_MODEL_ID_PART)) {
    return undefined;
  }

  return {
    bedrock: {
      // Passed as raw request fields instead of reasoningConfig because
      // @ai-sdk/amazon-bedrock overwrites additionalModelRequestFields
      // .thinking when reasoningConfig is set, and these models default
      // display to "omitted" (empty thinking text) — without "summarized"
      // the reasoning UI would render blank blocks.
      additionalModelRequestFields: {
        thinking: { type: "adaptive" as const, display: "summarized" },
        output_config: { effort: "medium" as const },
      },
    },
  };
}

export function getInAppAgentReasoningProviderOptions(
  config: InAppAgentModelConfig,
) {
  switch (config.provider) {
    case "anthropic": {
      if (!config.modelId.includes(ANTHROPIC_CLAUDE_MODEL_ID_PART)) {
        return undefined;
      }

      return {
        anthropic: {
          thinking: {
            type: "adaptive" as const,
            display: "summarized" as const,
          },
        },
      };
    }
    case "openai": {
      const call = resolveLangfuseAIOpenAICallFromEnv(config.baseURL);
      if (
        call.apiMode !== "responses" ||
        !config.modelId.includes(ANTHROPIC_CLAUDE_MODEL_ID_PART)
      ) {
        return call.providerOptions;
      }

      return forceResponsesReasoning(call.providerOptions);
    }
    case "bedrock":
      return getBedrockReasoningProviderOptions(config.modelId);
    default: {
      const _exhaustive: never = config;
      return undefined;
    }
  }
}

function resolveLangfuseAIOpenAICallFromEnv(baseURL: string | undefined) {
  return resolveLangfuseAIOpenAICall({
    baseURL,
    useResponsesApi: env.LANGFUSE_AI_USE_RESPONSES_API,
  });
}

// @ai-sdk/openai sends `reasoning` (and requests encrypted reasoning for
// stateless replay) only for model ids it detects as gpt/o-series reasoning
// models. `forceReasoning` extends that to Claude ids behind a Responses
// gateway. Forced reasoning also defaults `systemMessageMode` to `developer`;
// pinning it to `system` keeps the system role, so the reasoning fields are
// the only difference from the unforced request.
function forceResponsesReasoning(
  providerOptions: Extract<
    ReturnType<typeof resolveLangfuseAIOpenAICallFromEnv>,
    { apiMode: "responses" }
  >["providerOptions"],
) {
  return {
    openai: {
      ...providerOptions.openai,
      forceReasoning: true,
      systemMessageMode: "system" as const,
    },
  };
}
