import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import {
  NoObjectGeneratedError,
  Output,
  type FinishReason,
  type LanguageModelUsage,
} from "ai";
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

type TopicTextResponseMetadata = {
  finishReason: FinishReason;
  rawFinishReason?: string;
  textCharacters: number;
  textPartCount: number;
  reasoningCharacters: number;
  reasoningPartCount: number;
  toolCallCount: number;
  outputTokens?: number;
  reasoningTokens?: number;
  maxOutputTokens: number;
};

// Error identity and lifetime are preserved, including for frozen SDK errors.
const responseMetadataByError = new WeakMap<
  object,
  TopicTextResponseMetadata
>();

/** Bounded response diagnostics for the existing Topics failure log; no content. */
export function getTopicTextResponseMetadata(error: unknown) {
  return error !== null && typeof error === "object"
    ? responseMetadataByError.get(error)
    : undefined;
}

const RAW_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "refusal",
  "guardrail_intervened",
  "content_filtered",
  "model_context_window_exceeded",
  "malformed_model_output",
  "pause_turn",
  "STOP",
  "MAX_TOKENS",
  "SAFETY",
  "RECITATION",
  "OTHER",
]);

function boundedResponseMetadata(
  metadata: TopicTextResponseMetadata,
): TopicTextResponseMetadata {
  let rawFinishReason = metadata.rawFinishReason;
  if (
    rawFinishReason !== undefined &&
    !RAW_FINISH_REASONS.has(rawFinishReason)
  ) {
    rawFinishReason = "other";
  }
  const count = (value: number | undefined) =>
    value !== undefined && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  return {
    ...metadata,
    rawFinishReason,
    outputTokens: count(metadata.outputTokens),
    reasoningTokens: count(metadata.reasoningTokens),
  };
}

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
  let responseMetadata: TopicTextResponseMetadata | undefined;
  let failure: unknown;
  const recordResponse = (
    response: TopicTextResult,
    metadata: TopicTextResponseMetadata,
  ) => {
    result = response;
    responseMetadata = boundedResponseMetadata(metadata);
  };
  try {
    result =
      isBedrockGPT(params.model) && params.system.some((part) => part.cache)
        ? await invokeWithCache(params, recordResponse)
        : await generateWithConnection(params, recordResponse);
    return result;
  } catch (error) {
    failure = error;
    if (responseMetadata && error !== null && typeof error === "object") {
      responseMetadataByError.set(error, responseMetadata);
    }
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
  } catch {
    logger.error("Failed to publish Topics model trace", {
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

/** The provider-bound messages of a Topics request; also used to measure its egress. */
export function topicMessages(params: {
  system: TopicPromptPart[];
  input: string;
}) {
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
  recordResponse: (
    result: TopicTextResult,
    metadata: TopicTextResponseMetadata,
  ) => void,
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
    // onEnd runs before structured-output parsing and the output getter can throw.
    onEnd: ({ finalStep }) => {
      const counts = {
        textCharacters: 0,
        textPartCount: 0,
        reasoningCharacters: 0,
        reasoningPartCount: 0,
        toolCallCount: 0,
      };
      for (const part of finalStep.content) {
        if (part.type === "text") {
          counts.textCharacters += part.text.length;
          counts.textPartCount++;
        } else if (part.type === "reasoning") {
          counts.reasoningCharacters += part.text.length;
          counts.reasoningPartCount++;
        } else if (part.type === "tool-call") counts.toolCallCount++;
      }
      recordResponse(
        { output: finalStep.text, usage: topicUsage(finalStep.usage) },
        {
          finishReason: finalStep.finishReason,
          rawFinishReason: finalStep.rawFinishReason,
          ...counts,
          outputTokens: finalStep.usage.outputTokens,
          reasoningTokens: finalStep.usage.outputTokenDetails.reasoningTokens,
          maxOutputTokens: params.maxOutputTokens,
        },
      );
    },
  });
  const usage = topicUsage(result.usage);
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
  recordResponse: (
    result: TopicTextResult,
    metadata: TopicTextResponseMetadata,
  ) => void,
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
      message?: {
        content?: string | null;
        refusal?: string | null;
        tool_calls?: unknown[];
      };
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
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
  const rawFinishReason = json.choices?.[0]?.finish_reason;
  let finishReason: FinishReason = "other";
  if (rawFinishReason === "stop" || rawFinishReason === "length")
    finishReason = rawFinishReason;
  else if (rawFinishReason === "content_filter")
    finishReason = "content-filter";
  else if (
    rawFinishReason === "tool_calls" ||
    rawFinishReason === "function_call"
  )
    finishReason = "tool-calls";
  recordResponse(result, {
    finishReason,
    rawFinishReason,
    textCharacters:
      typeof message?.content === "string" ? message.content.length : 0,
    textPartCount: typeof message?.content === "string" ? 1 : 0,
    reasoningCharacters: 0,
    reasoningPartCount: 0,
    toolCallCount: Array.isArray(message?.tool_calls)
      ? message.tool_calls.length
      : 0,
    outputTokens: result.usage.outputTokens,
    reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
    maxOutputTokens: params.maxOutputTokens,
  });

  if (!message?.content || json.choices?.[0]?.finish_reason === "length")
    throw Object.assign(
      new Error(
        message?.refusal
          ? `The model refused: ${message.refusal}`
          : "The model returned no complete output.",
      ),
      { name: "AI_NoOutputGeneratedError" },
    );
  // A model can append text after a valid object; the caller treats that as unusable output.
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
