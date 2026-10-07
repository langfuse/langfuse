import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { generateText, Output } from "ai";
import { AwsClient } from "aws4fetch";
import { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

/** A system prompt segment; `cache` ends a reusable prefix with a cache breakpoint. */
export type TopicPromptPart = { text: string; cache?: boolean };

type TopicTextResult = {
  output: unknown;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

const TIMEOUT_MS = 60_000;

/**
 * Uses AWS credentials for Topics structured text. GPT-5.6+ models on Bedrock
 * reuse a shared prompt prefix only with explicit cache breakpoints, which
 * Converse does not accept for them, so cached prompts on OpenAI models use
 * InvokeModel at the same regional endpoint and model ID; others use Converse.
 */
export async function generateTopicText<T>(params: {
  model: string;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
}): Promise<TopicTextResult> {
  assertValidBedrockRegion(params.region);
  if (/(^|\.)openai\./.test(params.model) && params.system.some((p) => p.cache))
    return invokeWithCache(params);

  const provider = createAmazonBedrock({
    region: params.region,
    ...createDefaultBedrockProviderAuth({ profile: params.profile }),
  });
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
    timeout: TIMEOUT_MS,
  });
  return {
    output: result.output,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

async function invokeWithCache(params: {
  model: string;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType;
  maxOutputTokens: number;
  region: string;
  profile?: string;
}): Promise<TopicTextResult> {
  const credentials = await fromNodeProviderChain(
    params.profile ? { profile: params.profile } : {},
  )();
  const aws = new AwsClient({
    ...credentials,
    region: params.region,
    service: "bedrock",
    // Like the Converse path (maxRetries: 0): no hidden retries inside one model call.
    retries: 0,
  });
  const { $schema: _, ...schema } = z.toJSONSchema(params.schema);
  const response = await aws.fetch(
    `https://bedrock-runtime.${params.region}.amazonaws.com/model/${encodeURIComponent(params.model)}/invoke`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: params.system.map((part) => ({
              type: "text",
              text: part.text,
              ...(part.cache
                ? { prompt_cache_breakpoint: { mode: "explicit" } }
                : {}),
            })),
          },
          { role: "user", content: [{ type: "text", text: params.input }] },
        ],
        prompt_cache_options: { mode: "explicit", ttl: "30m" },
        reasoning_effort: "none",
        max_completion_tokens: params.maxOutputTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: "topics", schema, strict: true },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  // The status lets the Topics error classification tell throttling from auth or input errors.
  if (!response.ok)
    throw Object.assign(
      new Error(
        `Bedrock InvokeModel failed with ${response.status}: ${(await response.text()).slice(0, 500)}`,
      ),
      { status: response.status },
    );
  const json = (await response.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string | null; refusal?: string | null };
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
    };
  };
  const message = json.choices?.[0]?.message;
  if (!message?.content || json.choices?.[0]?.finish_reason === "length")
    throw new Error(
      message?.refusal
        ? `The model refused: ${message.refusal}`
        : "The model returned no complete output.",
    );
  return {
    output: JSON.parse(message.content) as unknown,
    usage: {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
      cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens,
      cacheWriteTokens: json.usage?.prompt_tokens_details?.cache_write_tokens,
    },
  };
}
