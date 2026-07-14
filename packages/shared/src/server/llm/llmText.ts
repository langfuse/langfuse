import { type ZodType } from "zod";

import { ProxyAgent } from "undici";
import {
  Output,
  generateText,
  getChunkTimeoutMs,
  getStepTimeoutMs,
  getTotalTimeoutMs,
  jsonSchema,
  streamText,
  tool,
  type GenerateTextAbortEvent,
  type GenerateTextOnAbortCallback,
  type GenerateTextOnEndCallback,
  type GenerateTextResult,
  type Experimental_DownloadFunction,
  type JSONValue,
  type ModelMessage,
  type StreamTextOnErrorCallback,
  type StreamTextResult,
  type StreamTextTransform,
  type TimeoutConfiguration,
  type ToolSet,
} from "ai";

import { decrypt } from "../../encryption";
import { env } from "../../env";
import type { LLMConnectionConfig } from "../../interfaces/customLLMProviderConfigSchemas";
import {
  hasTimeoutAbortInCauseChain,
  mapToLLMCompletionError,
} from "./completionErrorMapping";
import { LLMCompletionError } from "./errors";
import { mapChatMessagesToModelMessages } from "./ai-sdk/messages";
import { buildAiSdkModel } from "./ai-sdk/providers";
import { translateAnthropicProviderOptions } from "./ai-sdk/providers/anthropic";
import { translateBedrockProviderOptions } from "./ai-sdk/providers/bedrock";
import { translateGoogleProviderOptions } from "./ai-sdk/providers/google";
import { translateOpenAIProviderOptions } from "./ai-sdk/providers/openai";
import type {
  LLMCredentialSource,
  TranslatedProviderOptions,
} from "./ai-sdk/providers/types";
import { isClaudeModel } from "./ai-sdk/providers/vertex";
import {
  recordAiSdkExecution,
  resolveAiSdkModelConfig,
} from "./ai-sdk/resolveAiSdkModelConfig";
import {
  createAiSdkTelemetryCapture,
  type AiSdkTelemetryCapture,
} from "./ai-sdk/telemetry";
import { createSecureLlmFetch } from "./secureLlmFetch";
import type {
  ChatMessage,
  LLMJSONSchema,
  LLMToolDefinition,
  ModelParams,
  TraceSinkParams,
} from "./types";
import { LLMAdapter } from "./types";
import { decryptAndParseExtraHeaders } from "./utils";

type RuntimeContext = Record<string, unknown>;
type ProviderOptions = Record<string, Record<string, JSONValue>>;

export type LLMModelRef = {
  adapter: LLMAdapter;
  id: string;
};

export type LLMConnection = {
  /** Encrypted credential. It is decrypted only inside the execution boundary. */
  secretKey: string;
  /** Encrypted JSON object of additional headers. */
  extraHeaders?: string | null;
  baseURL?: string | null;
  config?: LLMConnectionConfig | null;
};

export type LLMModelMessage = ModelMessage;
export type LLMToolSet = ToolSet;
export type LLMProviderOptions = ProviderOptions;
export type LLMOutput<
  OUTPUT = unknown,
  PARTIAL = unknown,
  ELEMENT = never,
> = Output.Output<OUTPUT, PARTIAL, ELEMENT>;

export type StreamLLMTextOnAbortCallback<TOOLS extends ToolSet = ToolSet> =
  GenerateTextOnAbortCallback<TOOLS, RuntimeContext>;

type BaseLLMTextOptions<TOOLS extends ToolSet, OUTPUT extends Output.Output> = {
  model: LLMModelRef;
  connection: LLMConnection;
  messages: ModelMessage[];
  /**
   * Tool definitions only. Supplying an `execute` function is rejected so a
   * completion cannot silently become an agent loop inside this boundary.
   */
  tools?: TOOLS;
  output?: OUTPUT;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  /** Canonical, provider-namespaced AI SDK options. */
  providerOptions?: ProviderOptions;
  maxRetries?: number;
  timeout?: TimeoutConfiguration<TOOLS>;
  abortSignal?: AbortSignal;
  trace?: TraceSinkParams;
  credentialSource?: LLMCredentialSource;
  onEnd?: GenerateTextOnEndCallback<TOOLS, RuntimeContext>;
};

export type GenerateLLMTextOptions<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
> = BaseLLMTextOptions<TOOLS, OUTPUT>;

export type StreamLLMTextOptions<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
> = BaseLLMTextOptions<TOOLS, OUTPUT> & {
  onError?: StreamTextOnErrorCallback;
  onAbort?: StreamLLMTextOnAbortCallback<TOOLS>;
};

export type GenerateLLMTextResult<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
> = GenerateTextResult<TOOLS, RuntimeContext, OUTPUT>;

export type StreamLLMTextResult<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
> = StreamTextResult<TOOLS, RuntimeContext, OUTPUT>;

type PreparedLLMTextCall<TOOLS extends ToolSet> = {
  languageModel: Awaited<ReturnType<typeof buildAiSdkModel>>;
  capture?: AiSdkTelemetryCapture;
  runInTraceContext: <T>(fn: () => T) => T;
  callOptions: {
    messages: ModelMessage[];
    allowSystemInMessages: true;
    tools?: TOOLS;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    providerOptions?: ProviderOptions;
    maxRetries?: number;
    timeout: TimeoutConfiguration<TOOLS>;
    abortSignal?: AbortSignal;
    experimental_download: Experimental_DownloadFunction;
    telemetry?: AiSdkTelemetryCapture["telemetry"];
  };
};

/** Executes one non-streaming LLM call and returns the native AI SDK result. */
export async function generateLLMText<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
>(
  options: GenerateLLMTextOptions<TOOLS, OUTPUT>,
): Promise<GenerateLLMTextResult<TOOLS, OUTPUT>> {
  const prepared = await prepareLLMTextCall(options);
  const { capture, runInTraceContext } = prepared;

  try {
    const result = await runInTraceContext(() =>
      generateText<TOOLS, RuntimeContext, OUTPUT>({
        model: prepared.languageModel,
        ...prepared.callOptions,
        output: options.output,
        onEnd: options.onEnd,
      }),
    );

    capture?.setRootOutput(
      options.output
        ? result.output
        : toTraceOutput({
            text: result.text,
            reasoningText: result.finalStep.reasoningText,
            toolCalls: result.toolCalls,
          }),
    );

    return result;
  } catch (error) {
    const completionError = toCompletionError(
      error,
      prepared.callOptions.timeout,
    );
    capture?.setRootError(completionError);
    throw completionError;
  } finally {
    await capture?.flush();
  }
}

/**
 * Starts one streaming LLM call and returns the native AI SDK stream result.
 * Model construction can be asynchronous (notably Vertex ADC), so callers
 * await this function before consuming `textStream`, `stream`, or result
 * promises.
 */
export async function streamLLMText<
  TOOLS extends ToolSet = {},
  OUTPUT extends Output.Output = Output.Output<string, string, never>,
>(
  options: StreamLLMTextOptions<TOOLS, OUTPUT>,
): Promise<StreamLLMTextResult<TOOLS, OUTPUT>> {
  const prepared = await prepareLLMTextCall(options);
  const { capture, runInTraceContext } = prepared;
  const timeout = prepared.callOptions.timeout;

  try {
    return runInTraceContext(() =>
      streamText<TOOLS, RuntimeContext, OUTPUT>({
        model: prepared.languageModel,
        ...prepared.callOptions,
        output: options.output,
        // Map asynchronous provider and timeout failures before AI SDK's
        // event processor exposes them through streams, promises, callbacks,
        // and `consumeStream`.
        experimental_transform: createCompletionErrorTransform(timeout),
        onEnd: async (event) => {
          capture?.setRootOutput(
            toTraceOutput({
              text: event.text,
              reasoningText: event.finalStep.reasoningText,
              toolCalls: event.toolCalls,
            }),
          );
          try {
            await options.onEnd?.(event);
          } finally {
            await capture?.flush();
          }
        },
        onError: async (event) => {
          // `event.error` has already passed through the transform above.
          capture?.setRootError(event.error);
          try {
            await options.onError?.(event);
          } finally {
            await capture?.flush();
          }
        },
        onAbort: async (event) => {
          capture?.setRootError(
            new LLMCompletionError({
              message: "LLM completion aborted",
              responseStatusCode: 499,
              isRetryable: false,
            }),
          );
          try {
            // streamText's public callback type currently omits callId/reason,
            // although its runtime event includes the full native abort event.
            await options.onAbort?.(
              event as GenerateTextAbortEvent<TOOLS, RuntimeContext>,
            );
          } finally {
            await capture?.flush();
          }
        },
      }),
    );
  } catch (error) {
    const completionError = toCompletionError(error, timeout);
    capture?.setRootError(completionError);
    await capture?.flush();
    throw completionError;
  }
}

async function prepareLLMTextCall<
  TOOLS extends ToolSet,
  OUTPUT extends Output.Output,
>(
  options: BaseLLMTextOptions<TOOLS, OUTPUT>,
): Promise<PreparedLLMTextCall<TOOLS>> {
  assertDefinitionOnlyTools(options.tools);

  const credentialSource = options.credentialSource ?? "user";
  const timeout =
    options.timeout ?? env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS;

  try {
    const modelConfig = resolveAiSdkModelConfig({
      model: options.model,
      connectionConfig: options.connection.config,
      baseURL: options.connection.baseURL,
      credentialSource,
    });
    recordAiSdkExecution({ model: options.model, modelConfig });

    const apiKey = decrypt(options.connection.secretKey);
    const extraHeaders = decryptAndParseExtraHeaders(
      options.connection.extraHeaders,
    );

    const proxyDispatcher = env.HTTPS_PROXY
      ? new ProxyAgent(env.HTTPS_PROXY)
      : undefined;
    const createFetch = (
      logContext: string,
      additionalSensitiveHeaders?: string[],
    ) =>
      createSecureLlmFetch({
        logContext,
        // Connection-specific headers are encrypted at rest and can contain
        // gateway credentials. Keep them on same-origin redirects, but strip
        // them alongside provider auth headers when the origin changes.
        additionalSensitiveHeaders: (additionalSensitiveHeaders ?? []).concat(
          Object.keys(extraHeaders ?? {}),
        ),
        dispatcher: proxyDispatcher,
      });

    const languageModel = await buildAiSdkModel({
      model: options.model,
      modelConfig,
      apiKey,
      baseURL: options.connection.baseURL,
      extraHeaders,
      config: options.connection.config,
      credentialSource,
      createFetch,
    });

    const capture = options.trace
      ? createAiSdkTelemetryCapture({
          traceSinkParams: options.trace,
          rootInput: options.messages,
        })
      : undefined;

    return {
      languageModel,
      capture,
      runInTraceContext: <T>(fn: () => T): T =>
        capture ? capture.run(fn) : fn(),
      callOptions: {
        messages: options.messages,
        allowSystemInMessages: true,
        tools: options.tools,
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        topP: options.topP,
        providerOptions: options.providerOptions,
        maxRetries: options.maxRetries,
        timeout,
        abortSignal: options.abortSignal,
        // Do not let AI SDK download remote media on the Langfuse server.
        // Callers must use provider-supported URLs or inline data.
        experimental_download: rejectRemoteMediaDownloads,
        ...(capture ? { telemetry: capture.telemetry } : {}),
      },
    };
  } catch (error) {
    throw toCompletionError(error, timeout);
  }
}

const rejectRemoteMediaDownloads: Experimental_DownloadFunction = async (
  downloads,
) => {
  if (downloads.length > 0) {
    throw new LLMCompletionError({
      message:
        "Remote media downloads are not supported on the Langfuse server; use provider-supported URLs or inline data instead",
      responseStatusCode: 400,
      isRetryable: false,
    });
  }
  return [];
};

function assertDefinitionOnlyTools(tools: ToolSet | undefined): void {
  if (!tools) return;

  const executableTool = Object.entries(tools).find(
    ([, definition]) =>
      typeof (definition as { execute?: unknown }).execute === "function",
  );
  if (!executableTool) return;

  throw new LLMCompletionError({
    message: `Tool "${executableTool[0]}" must not define execute; LLM text calls only accept tool definitions`,
    responseStatusCode: 400,
    isRetryable: false,
  });
}

function createCompletionErrorTransform<TOOLS extends ToolSet>(
  timeout: TimeoutConfiguration<TOOLS>,
): StreamTextTransform<TOOLS> {
  return () =>
    new TransformStream({
      transform(part, controller) {
        controller.enqueue(
          part.type === "error"
            ? { ...part, error: toCompletionError(part.error, timeout) }
            : part,
        );
      },
    });
}

function toCompletionError<TOOLS extends ToolSet>(
  error: unknown,
  timeout: TimeoutConfiguration<TOOLS>,
): LLMCompletionError {
  if (hasTimeoutAbortInCauseChain(error)) {
    return new LLMCompletionError({
      message: `Request timed out after ${getTimeoutMs(timeout)}ms`,
      responseStatusCode: 500,
      isRetryable: false,
      cause: error,
    });
  }

  return mapToLLMCompletionError(error);
}

function getTimeoutMs<TOOLS extends ToolSet>(
  timeout: TimeoutConfiguration<TOOLS>,
): number {
  return (
    getTotalTimeoutMs(timeout) ??
    getStepTimeoutMs(timeout) ??
    getChunkTimeoutMs(timeout) ??
    env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS
  );
}

function toTraceOutput(params: {
  text: string;
  reasoningText?: string;
  toolCalls: readonly unknown[];
}): unknown {
  const { text, reasoningText, toolCalls } = params;

  if (toolCalls.length > 0) {
    return {
      text,
      toolCalls,
      ...(reasoningText ? { reasoningText } : {}),
    };
  }
  if (reasoningText) return { text, reasoningText };

  return text;
}

/** Creates definition-only AI SDK tools from the persisted playground shape. */
export function createLLMToolSet(tools: LLMToolDefinition[]): ToolSet {
  return Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema(
          definition.parameters as Parameters<typeof jsonSchema>[0],
        ),
      }),
    ]),
  );
}

/** Creates a typed AI SDK object output from Zod or persisted JSON Schema. */
export function createLLMOutput<OUTPUT>(
  schema: ZodType<OUTPUT>,
): Output.Output<OUTPUT, unknown, never>;
export function createLLMOutput(
  schema: LLMJSONSchema,
): Output.Output<Record<string, unknown>, unknown, never>;
export function createLLMOutput(
  schema: ZodType | LLMJSONSchema,
): Output.Output<unknown, unknown, never>;
export function createLLMOutput(
  schema: ZodType | LLMJSONSchema,
): Output.Output<unknown, unknown, never> {
  const isStandardSchema =
    schema instanceof Object && "~standard" in (schema as object);
  const flexibleSchema = isStandardSchema
    ? (schema as ZodType)
    : jsonSchema(schema as Parameters<typeof jsonSchema>[0]);

  return Output.object({ schema: flexibleSchema }) as Output.Output<
    unknown,
    unknown,
    never
  >;
}

export type LegacyLLMTextOptions = {
  model: LLMModelRef;
  connection: LLMConnection;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  providerOptions?: ProviderOptions;
  credentialSource: LLMCredentialSource;
};

/**
 * Compatibility boundary for persisted/UI Langfuse shapes. New runtime code
 * should pass native messages and namespaced provider options directly.
 */
export function mapLegacyLLMCompletionParams(params: {
  messages: ChatMessage[];
  modelParams: ModelParams;
  connection: LLMConnection;
  credentialSource?: LLMCredentialSource;
}): LegacyLLMTextOptions {
  const { modelParams } = params;
  const providerOptions = translateLegacyProviderOptions(modelParams);

  return {
    model: { adapter: modelParams.adapter, id: modelParams.model },
    connection: params.connection,
    messages: mapChatMessagesToModelMessages(params.messages, {
      adapter: modelParams.adapter,
    }),
    maxOutputTokens: modelParams.max_tokens,
    temperature: modelParams.temperature,
    topP: modelParams.top_p,
    providerOptions,
    credentialSource: params.credentialSource ?? "user",
  };
}

function translateLegacyProviderOptions(
  modelParams: ModelParams,
): ProviderOptions | undefined {
  let namespace: string;
  let translated: TranslatedProviderOptions;

  switch (modelParams.adapter) {
    case LLMAdapter.OpenAI: {
      namespace = "openai";
      translated = translateOpenAIProviderOptions(modelParams.providerOptions);
      if (
        translated.ok &&
        isOpenAINonReasoningChatModel(modelParams.model) &&
        translated.value?.forceReasoning === undefined
      ) {
        translated.value = {
          ...(translated.value ?? {}),
          forceReasoning: false,
        };
      }
      break;
    }
    case LLMAdapter.Azure:
      namespace = "openai";
      translated = translateOpenAIProviderOptions(modelParams.providerOptions);
      break;
    case LLMAdapter.Anthropic:
      namespace = "anthropic";
      translated = translateAnthropicProviderOptions(
        modelParams.providerOptions,
      );
      break;
    case LLMAdapter.Bedrock:
      namespace = "bedrock";
      translated = translateBedrockProviderOptions(modelParams.providerOptions);
      break;
    case LLMAdapter.GoogleAIStudio:
      namespace = "google";
      translated = translateGoogleProviderOptions({
        providerOptions: modelParams.providerOptions,
        model: modelParams.model,
      });
      break;
    case LLMAdapter.VertexAI: {
      const isClaude = isClaudeModel(modelParams.model);
      namespace = isClaude ? "anthropic" : "google";
      translated = isClaude
        ? translateAnthropicProviderOptions(modelParams.providerOptions, {
            dropModelOverride: true,
          })
        : translateGoogleProviderOptions({
            providerOptions: modelParams.providerOptions,
            model: modelParams.model,
            maxReasoningTokens: modelParams.maxReasoningTokens,
          });
      break;
    }
    default: {
      const _exhaustiveCheck: never = modelParams.adapter;
      throw new LLMCompletionError({
        message: `Unsupported LLM adapter: ${_exhaustiveCheck}`,
        responseStatusCode: 400,
        isRetryable: false,
      });
    }
  }

  if (!translated.ok) {
    throw new LLMCompletionError({
      message: `Unsupported ${modelParams.adapter} provider options: ${translated.unknownKeys.join(", ")}`,
      responseStatusCode: 400,
      isRetryable: false,
    });
  }

  return translated.value
    ? ({ [namespace]: translated.value } as ProviderOptions)
    : undefined;
}

function isOpenAINonReasoningChatModel(model: string): boolean {
  return /^gpt-5\.4-(mini|nano)(-\d{4}-\d{2}-\d{2})?$/i.test(
    model.replace(/^openai\//i, ""),
  );
}

export { mapChatMessagesToModelMessages };
