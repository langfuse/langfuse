import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createBedrockMantle } from "@ai-sdk/amazon-bedrock/mantle";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

/** A system prompt segment; `cache` ends a reusable prefix with a cache breakpoint. */
export type TopicPromptPart = { text: string; cache?: boolean };

const GEO_PREFIX_REGION = { us: "us-", eu: "eu-", apac: "ap-" } as const;

/**
 * GPT-5.6+ models on Bedrock reuse a shared prompt prefix only with explicit
 * cache breakpoints, which Converse does not accept for them; the regional
 * Bedrock Mantle endpoint (OpenAI-compatible) does. Returns the in-region model
 * ID when the configured model's geography matches the configured region, so a
 * request never leaves that geography; other models keep using Converse.
 */
function mantleModelId(model: string, region: string): string | undefined {
  const match = /^(?:(us|eu|apac)\.)?(openai\..+)$/.exec(model);
  if (!match) return undefined;
  const [, geo, inRegionModel] = match;
  if (
    geo &&
    !region.startsWith(GEO_PREFIX_REGION[geo as keyof typeof GEO_PREFIX_REGION])
  )
    return undefined;
  return inRegionModel;
}

/** Uses the shared AI SDK and AWS credentials for Topics structured text. */
export async function generateTopicText<T>(params: {
  model: string;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
}) {
  assertValidBedrockRegion(params.region);
  const auth = createDefaultBedrockProviderAuth({ profile: params.profile });
  const cached = params.system.some((part) => part.cache);
  const mantleModel = cached
    ? mantleModelId(params.model, params.region)
    : undefined;

  if (mantleModel) {
    const provider = createBedrockMantle({ region: params.region, ...auth });
    const breakpoint = {
      openai: { promptCacheBreakpoint: { mode: "explicit" as const } },
    };
    const messages: ModelMessage[] = [
      ...params.system.map((part) => ({
        role: "system" as const,
        content: part.text,
        ...(part.cache ? { providerOptions: breakpoint } : {}),
      })),
      { role: "user", content: params.input },
    ];
    const result = await generateText({
      model: provider.chat(mantleModel),
      messages,
      allowSystemInMessages: true,
      output: Output.object({ schema: params.schema }),
      providerOptions: {
        openai: {
          promptCacheOptions: { mode: "explicit", ttl: "30m" },
          reasoningEffort: "none",
          // The SDK does not recognize Bedrock model IDs as reasoning models, so set this explicitly.
          maxCompletionTokens: params.maxOutputTokens,
        },
      },
      maxRetries: 0,
      timeout: 60_000,
    });
    return toTopicTextResult(result);
  }

  const provider = createAmazonBedrock({ region: params.region, ...auth });
  const result = await generateText({
    model: provider(params.model),
    messages: [
      {
        role: "system",
        content: params.system.map((part) => part.text).join("\n\n"),
      },
      { role: "user", content: params.input },
    ],
    allowSystemInMessages: true,
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: {
      bedrock: {
        additionalModelRequestFields: { reasoning: { effort: "none" } },
      },
    },
    maxRetries: 0,
    timeout: 60_000,
  });
  return toTopicTextResult(result);
}

function toTopicTextResult(result: {
  output: unknown;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    inputTokenDetails?: {
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
  };
}) {
  return {
    output: result.output,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      cacheReadTokens: result.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens,
    },
  };
}
