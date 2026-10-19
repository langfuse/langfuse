import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { NoObjectGeneratedError, Output, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { decrypt } from "../../encryption";
import { BedrockConfigSchema } from "../../interfaces/customLLMProviderConfigSchemas";
import {
  assertValidBedrockRegion,
  canUseBedrockDefaultCredentials,
  resolveBedrockProviderAuth,
} from "../llm/ai-sdk/providers/bedrock";
import { generateLLMText } from "../llm/llmText";
import { LLMAdapter, type TraceSinkParams } from "../llm/types";
import { logger } from "../logger";
import { parseOutboundUrl } from "../outbound-url/validation";
import { writeInternalTraceViaOtelIngestion } from "../otel/internalTraceOtelWriter";
import type { TopicsModel } from "./model-config";

const TIMEOUT_MS = 60_000;

/**
 * Structured Topics text through the project's LLM connection. GPT-5.6+ models
 * on Bedrock reuse a shared prompt prefix only with explicit cache breakpoints,
 * which Converse does not accept for them, so cached prompts on those models
 * use InvokeModel at the same regional endpoint and model ID.
 */
export async function generateTopicText<T>(
  params: TopicTextParams<T>,
): Promise<TopicTextResult> {
  const startTimeISO = new Date().toISOString();
  let result: TopicTextResult | undefined;
  let failure: unknown;
  const recordResponse = (response: TopicTextResult) => {
    result = response;
  };
  try {
    result =
      isBedrockGPT(params.model) && params.system.some((part) => part.cache)
        ? await invokeWithCache(params, recordResponse)
        : await generateWithConnection(params, recordResponse);
    return result;
  } catch (error) {
    failure = error;
    if (NoObjectGeneratedError.isInstance(error)) {
      result = { output: error.text, usage: topicUsage(error.usage) };
    }
    throw error;
  } finally {
    await writeTopicTrace(params, startTimeISO, result, failure);
  }
}

async function writeTopicTrace<T>(
  params: TopicTextParams<T>,
  startTimeISO: string,
  result: TopicTextResult | undefined,
  failure: unknown,
) {
  const { trace } = params;
  if (!trace) return;
  try {
    /** Validation marks the trace; the caller validates after accounting for usage. */
    const validation = params.schema.safeParse(result?.output);
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: trace.traceId,
      eventInputs: [
        {
          projectId: trace.targetProjectId,
          traceId: trace.traceId,
          spanId: trace.traceId,
          name: trace.traceName,
          traceName: trace.traceName,
          type: "GENERATION",
          environment: trace.environment,
          startTimeISO,
          endTimeISO: new Date().toISOString(),
          modelName: params.model.model,
          modelParameters: { maxOutputTokens: params.maxOutputTokens },
          input: JSON.stringify(topicMessages(params)),
          output: JSON.stringify(result?.output),
          providedUsageDetails: topicTraceUsage(result?.usage),
          metadata: trace.metadata ?? {},
          userId: trace.userId,
          sessionId: trace.sessionId,
          ...topicTraceError(failure ?? validation.error),
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to publish Topics model trace", {
      error,
      traceId: trace.traceId,
    });
  }
}

function topicTraceUsage(usage: TopicTextResult["usage"] | undefined) {
  if (!usage) return undefined;
  const details: Record<string, number | undefined> = {
    input: undefined,
    output: usage.outputTokens,
    total: usage.totalTokens,
    input_cached_tokens: usage.cacheReadTokens,
    input_cache_creation: usage.cacheWriteTokens,
  };
  /** Standard input excludes cached tokens, which have their own prices. */
  if (usage.inputTokens !== undefined) {
    details.input = Math.max(
      0,
      usage.inputTokens -
        (usage.cacheReadTokens ?? 0) -
        (usage.cacheWriteTokens ?? 0),
    );
  }
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, number] => entry[1] !== undefined,
    ),
  );
}

function topicTraceError(failure: unknown) {
  if (failure === undefined) return {};
  return {
    level: "ERROR" as const,
    statusMessage: failure instanceof Error ? failure.message : String(failure),
  };
}

function topicMessages(params: { system: TopicPromptPart[]; input: string }) {
  return [
    {
      role: "system" as const,
      content: params.system.map((part) => part.text).join("\n\n"),
    },
    { role: "user" as const, content: params.input },
  ];
}

function topicUsage(
  usage: LanguageModelUsage | undefined,
): TopicTextResult["usage"] {
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens,
  };
}

async function generateWithConnection<T>(
  params: TopicTextParams<T>,
  recordResponse: (result: TopicTextResult) => void,
): Promise<TopicTextResult> {
  const nativeOpenAI = isFirstPartyOpenAI(params.model);
  const result = await generateLLMText({
    model: { adapter: params.model.adapter, id: params.model.model },
    connection: params.model.connection,
    openAIChatProvider: nativeOpenAI ? "native" : undefined,
    // The static system prompt comes first so providers with automatic prefix
    // caching can reuse it across traces.
    messages: topicMessages(params),
    output: Output.object({ schema: params.schema }),
    maxOutputTokens: params.maxOutputTokens,
    reasoning: nativeOpenAI ? openAIReasoning(params.model.model) : "none",
    // Bedrock ignores portable reasoning for OpenAI models; their default effort
    // is not none.
    ...(isBedrockGPT(params.model)
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
    timeout: params.timeoutMs ?? TIMEOUT_MS,
  });
  const usage = topicUsage(result.usage);
  // The SDK's output getter can throw after a response with billable usage.
  recordResponse({ output: result.text, usage });
  return {
    output: result.output,
    usage,
  };
}

/** Topics owns its OpenAI request options; saved evaluator options keep their routing. */
function isFirstPartyOpenAI(model: TopicsModel): boolean {
  if (model.adapter !== LLMAdapter.OpenAI) return false;
  if (!model.connection.baseURL) return true;
  try {
    const hostname = parseOutboundUrl(
      model.connection.baseURL.replace("{model}", model.model),
    ).hostname.replace(/\.$/, "");
    return (
      hostname === "api.openai.com" || hostname.endsWith(".api.openai.com")
    );
  } catch {
    return false;
  }
}

/** Selects low-latency reasoning only for known models; others use their defaults. */
function openAIReasoning(model: string): "none" | "minimal" | undefined {
  const id = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (/^gpt-5(?:-(?:mini|nano))?$/.test(id)) return "minimal";
  if (
    /^gpt-5\.[1-6](?:-(?:mini|nano|luna|sol|terra))?$/.test(id) ||
    id === "gpt-6-luna" ||
    id === "gpt-6-sol"
  )
    return "none";
  return undefined;
}

function isBedrockGPT(model: TopicsModel): boolean {
  if (model.adapter !== LLMAdapter.Bedrock) return false;
  /** Opaque application inference profiles cannot identify the underlying model. */
  const version = /(?:^|[/.])openai\.gpt-(\d+)(?:\.(\d+))?(?:[-:]|$)/.exec(
    model.model,
  );
  return Boolean(
    version &&
    (Number(version[1]) > 5 ||
      (Number(version[1]) === 5 && Number(version[2] ?? 0) >= 6)),
  );
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
    allowDefaultCredentials: canUseBedrockDefaultCredentials(
      model.connection.projectId,
    ),
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

async function invokeWithCache(
  params: TopicTextParams<unknown>,
  recordResponse: (result: TopicTextResult) => void,
): Promise<TopicTextResult> {
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
    signal: AbortSignal.timeout(params.timeoutMs ?? TIMEOUT_MS),
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
  const result: TopicTextResult = {
    output: message?.content ?? message?.refusal,
    usage: {
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
      totalTokens: json.usage?.total_tokens,
      cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens,
      cacheWriteTokens: json.usage?.prompt_tokens_details?.cache_write_tokens,
    },
  };
  // Retain paid usage and the original response if parsing or validation fails.
  recordResponse(result);

  if (!message?.content || json.choices?.[0]?.finish_reason === "length")
    throw new Error(
      message?.refusal
        ? `The model refused: ${message.refusal}`
        : "The model returned no complete output.",
    );
  return { ...result, output: JSON.parse(message.content) as unknown };
}

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

type TopicTextParams<T> = {
  model: TopicsModel;
  system: TopicPromptPart[];
  input: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  timeoutMs?: number;
  trace?: TraceSinkParams;
};
