import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { Output } from "ai";
import { z } from "zod";
import { decrypt } from "../../encryption";
import { env } from "../../env";
import { BedrockConfigSchema } from "../../interfaces/customLLMProviderConfigSchemas";
import {
  assertValidBedrockRegion,
  resolveBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";
import { generateLLMText } from "../llm/llmText";
import { LLMAdapter } from "../llm/types";
import type { TopicsModel } from "./model-config";

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

const isBedrockOpenAI = (model: TopicsModel) =>
  model.adapter === LLMAdapter.Bedrock && /(^|\.)openai\./.test(model.model);

/**
 * Structured Topics text through the project's LLM connection. GPT-5.6+ models
 * on Bedrock reuse a shared prompt prefix only with explicit cache breakpoints,
 * which Converse does not accept for them, so cached prompts on those models
 * use InvokeModel at the same regional endpoint and model ID.
 */
export async function generateTopicText<T>(params: {
  model: TopicsModel;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
}): Promise<TopicTextResult> {
  if (isBedrockOpenAI(params.model) && params.system.some((p) => p.cache))
    return invokeWithCache(params);

  const result = await generateLLMText({
    model: { adapter: params.model.adapter, id: params.model.model },
    connection: params.model.connection,
    // The static system prompt comes first so providers with automatic prefix
    // caching can reuse it across traces.
    messages: [
      {
        role: "system",
        content: params.system.map((part) => part.text).join("\n\n"),
      },
      { role: "user", content: params.input },
    ],
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    reasoning: "none",
    // Bedrock ignores portable reasoning for OpenAI models; their default effort
    // is not none.
    ...(isBedrockOpenAI(params.model)
      ? {
          providerOptions: {
            bedrock: {
              additionalModelRequestFields: { reasoning: { effort: "none" } },
            },
          },
        }
      : {}),
    // The AI SDK retries 429 and 5xx responses with exponential backoff.
    maxRetries: 2,
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

function signingCredentials(
  auth: ReturnType<typeof resolveBedrockProviderAuth>,
) {
  const { credentialProvider } = auth;
  if (credentialProvider)
    return async () => {
      const resolved = await credentialProvider();
      return {
        accessKeyId: resolved.accessKeyId,
        secretAccessKey: resolved.secretAccessKey,
        sessionToken: resolved.sessionToken,
      };
    };
  if (auth.accessKeyId && auth.secretAccessKey)
    return {
      accessKeyId: auth.accessKeyId,
      secretAccessKey: auth.secretAccessKey,
    };
  return undefined;
}

/** SigV4 or bearer-token auth from the connection's stored Bedrock credential. */
async function bedrockRequestHeaders(
  model: TopicsModel,
  url: URL,
  region: string,
  body: string,
): Promise<Record<string, string>> {
  const headers = {
    host: url.hostname,
    "content-type": "application/json",
    accept: "application/json",
  };
  const auth = resolveBedrockProviderAuth({
    secretKey: decrypt(model.connection.secretKey),
    allowDefaultCredentials: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  });
  if (auth.apiKey)
    return { ...headers, authorization: `Bearer ${auth.apiKey}` };
  const credentials = signingCredentials(auth);
  if (!credentials)
    throw new Error(
      "Invalid Bedrock credentials. Expected AWS access key JSON or a Bedrock API key.",
    );
  // AWS's own SigV4 signer, as used by the AWS SDK.
  const signed = await new SignatureV4({
    credentials,
    region,
    service: "bedrock",
    sha256: Sha256,
  }).sign({
    method: "POST",
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers,
    body,
  });
  return signed.headers;
}

async function invokeWithCache(params: {
  model: TopicsModel;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType;
  maxOutputTokens: number;
}): Promise<TopicTextResult> {
  const { region } = BedrockConfigSchema.parse(params.model.connection.config);
  assertValidBedrockRegion(region);
  const { $schema: _, ...schema } = z.toJSONSchema(params.schema);
  const url = new URL(
    `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(params.model.model)}/invoke`,
  );
  const body = JSON.stringify({
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
  });
  // A single attempt; the host is derived from the validated region.
  const response = await fetch(url, {
    method: "POST",
    headers: await bedrockRequestHeaders(params.model, url, region, body),
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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
