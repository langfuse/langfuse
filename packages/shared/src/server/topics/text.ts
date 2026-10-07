import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";

/** A system prompt segment; `cache` ends a reusable prefix with a cache breakpoint. */
export type TopicPromptPart = { text: string; cache?: boolean };

export type TopicTextUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

const TIMEOUT_MS = 60_000;

/**
 * Uses AWS credentials for Topics structured text. Cached prompts on OpenAI
 * models go through InvokeModel, the Bedrock API that accepts explicit cache
 * breakpoints for them; everything else uses Converse via the AI SDK.
 */
export async function generateTopicText<T>(params: {
  model: string;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  region: string;
  profile?: string;
}): Promise<{ output: unknown; usage: TopicTextUsage }> {
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
}): Promise<{ output: unknown; usage: TopicTextUsage }> {
  const client = new BedrockRuntimeClient({
    region: params.region,
    credentials: fromNodeProviderChain(
      params.profile ? { profile: params.profile } : {},
    ),
    // Sign with AWS credentials even when a Bedrock bearer token is in the environment.
    authSchemePreference: ["sigv4"],
    maxAttempts: 1,
  });
  const body = {
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
      json_schema: {
        name: "topics",
        schema: strictJsonSchema(params.schema),
        strict: true,
      },
    },
  };
  const response = await client.send(
    new InvokeModelCommand({
      modelId: params.model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    }),
    { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const json = JSON.parse(new TextDecoder().decode(response.body)) as {
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
  const choice = json.choices?.[0];
  if (choice?.message?.refusal)
    throw new Error(`The model refused: ${choice.message.refusal}`);
  if (choice?.finish_reason === "length" || !choice?.message?.content)
    throw new Error(
      `The model returned no complete output (finish reason ${choice?.finish_reason ?? "unknown"}).`,
    );
  return {
    output: JSON.parse(choice.message.content),
    usage: {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
      cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens,
      cacheWriteTokens: json.usage?.prompt_tokens_details?.cache_write_tokens,
    },
  };
}

// Strict JSON Schema output requires closed objects with every property required.
function strictJsonSchema(schema: z.ZodType): unknown {
  const close = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(close);
    if (!node || typeof node !== "object") return node;
    const entries = Object.entries(node).filter(([key]) => key !== "$schema");
    const out = Object.fromEntries(
      entries.map(([key, value]) => [key, close(value)]),
    ) as Record<string, unknown>;
    if (out.type === "object" && out.properties)
      return {
        ...out,
        additionalProperties: false,
        required: Object.keys(out.properties),
      };
    return out;
  };
  return close(z.toJSONSchema(schema));
}
