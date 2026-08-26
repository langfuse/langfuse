import { createAmazonBedrock } from "ai-sdk-amazon-bedrock-v4";
import { createAnthropic } from "ai-sdk-anthropic-v4";
import { createOpenAI } from "ai-sdk-openai-v4";

import type { InAppAgentModelConfig } from "@langfuse/shared/in-app-agent/server/modelProvider";
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
      const openai = createOpenAI({
        apiKey: params.config.apiKey,
        ...(params.config.baseURL ? { baseURL: params.config.baseURL } : {}),
        ...(params.config.extraHeaders
          ? { headers: params.config.extraHeaders }
          : {}),
      });

      // Chat Completions so OpenAI-compatible proxies work; the Responses API
      // is out of scope for instance-wide Langfuse AI.
      return openai.chat(params.config.modelId) as InAppAgentLanguageModel;
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
    case "openai":
      return undefined;
    case "bedrock":
      return getBedrockReasoningProviderOptions(config.modelId);
    default: {
      const _exhaustive: never = config;
      return undefined;
    }
  }
}
