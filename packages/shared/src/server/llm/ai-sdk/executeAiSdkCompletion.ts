import { ZodType } from "zod";

import { IterableReadableStream } from "@langchain/core/utils/stream";
import {
  generateText,
  jsonSchema,
  Output,
  streamText,
  tool,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type TelemetryOptions,
  type ToolSet,
} from "ai";

import {
  hasTimeoutAbortInCauseChain,
  mapToLLMCompletionError,
} from "../completionErrorMapping";
import { LLMCompletionError } from "../errors";
import {
  ChatMessage,
  LLMJSONSchema,
  LLMToolDefinition,
  ModelParams,
  ToolCallResponse,
  ToolCallResponseSchema,
  TraceSinkParams,
} from "../types";
import { mapChatMessagesToModelMessages } from "./messages";
import { buildOpenAIModel, type OpenAIApiMode } from "./providers/openai";
import {
  createAiSdkTelemetryCapture,
  type AiSdkTelemetryCapture,
} from "./telemetry";

type CompletionWithReasoning = { text: string; reasoning?: string };

type BaseCallOptions = {
  model: LanguageModel;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  maxRetries?: number;
  timeout: number;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  telemetry?: TelemetryOptions;
};

export type AiSdkCompletionParams = {
  messages: ChatMessage[];
  tools?: LLMToolDefinition[];
  modelParams: ModelParams;
  streaming: boolean;
  structuredOutputSchema?: ZodType | LLMJSONSchema;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  maxRetries?: number;
  timeoutMs: number;
  fetch: typeof fetch;
  apiMode: OpenAIApiMode;
  translatedProviderOptions?: Record<string, unknown>;
  traceSinkParams?: TraceSinkParams;
};

/**
 * AI SDK execution engine for `fetchLLMCompletion`. Preserves the external
 * contracts of the LangChain engine: same return shapes per mode, same
 * `LLMCompletionError` classification (via `mapToLLMCompletionError`), and the
 * same runtime-timeout message that the retry classification keys on.
 */
export async function executeAiSdkCompletion(
  params: AiSdkCompletionParams,
): Promise<
  | string
  | CompletionWithReasoning
  | IterableReadableStream<Uint8Array>
  | Record<string, unknown>
  | ToolCallResponse
> {
  const {
    messages,
    tools,
    modelParams,
    streaming,
    structuredOutputSchema,
    maxRetries,
    timeoutMs,
    translatedProviderOptions,
    traceSinkParams,
  } = params;

  const model = buildOpenAIModel(params);
  const modelMessages: ModelMessage[] =
    mapChatMessagesToModelMessages(messages);

  const capture = traceSinkParams
    ? createAiSdkTelemetryCapture({
        traceSinkParams,
        rootInput: messages,
      })
    : undefined;

  const runInTraceContext = <T>(fn: () => T): T =>
    capture ? capture.run(fn) : fn();

  const baseOptions: BaseCallOptions = {
    model,
    messages: modelMessages,
    maxOutputTokens: modelParams.max_tokens,
    temperature: modelParams.temperature,
    topP: modelParams.top_p,
    maxRetries,
    timeout: timeoutMs,
    ...(translatedProviderOptions
      ? {
          providerOptions: {
            openai: translatedProviderOptions as Record<string, JSONValue>,
          },
        }
      : {}),
    ...(capture ? { telemetry: capture.telemetry } : {}),
  };

  if (streaming) {
    return executeStreaming({
      baseOptions,
      timeoutMs,
      capture,
      runInTraceContext,
    });
  }

  try {
    if (structuredOutputSchema) {
      const result = await runInTraceContext(() =>
        generateText({
          ...baseOptions,
          output: Output.object({
            schema: toFlexibleSchema(structuredOutputSchema),
          }),
        }),
      );

      const output = result.output as Record<string, unknown>;
      capture?.setRootOutput(output);

      return output;
    }

    if (tools && tools.length > 0) {
      const result = await runInTraceContext(() =>
        generateText({ ...baseOptions, tools: buildToolSet(tools) }),
      );

      const parsed = ToolCallResponseSchema.safeParse({
        content: result.text,
        tool_calls: result.toolCalls.map((toolCall) => ({
          name: toolCall.toolName,
          id: toolCall.toolCallId,
          args: toolCall.input ?? {},
        })),
      });

      if (!parsed.success) throw Error("Failed to parse LLM tool call result");

      const reasoning = result.finalStep?.reasoningText;
      const toolCallResponse = {
        ...parsed.data,
        ...(reasoning ? { reasoning } : {}),
      };
      capture?.setRootOutput(toolCallResponse);

      return toolCallResponse;
    }

    const result = await runInTraceContext(() => generateText(baseOptions));

    const reasoning = result.finalStep?.reasoningText;
    const completion = reasoning
      ? { text: result.text, reasoning }
      : result.text;
    capture?.setRootOutput(completion);

    return completion;
  } catch (e) {
    throw toCompletionError(e, timeoutMs);
  } finally {
    await capture?.flush();
  }
}

/**
 * Normalizes AI SDK failures to `LLMCompletionError`. Native SDK timeouts
 * (DOMException "TimeoutError" without status or message pattern) are mapped
 * to the canonical runtime-timeout error so the shared retry classification
 * keeps treating timeouts as non-retryable, exactly like the LangChain
 * engine's `executeWithRuntimeTimeout`.
 */
function toCompletionError(e: unknown, timeoutMs: number): LLMCompletionError {
  if (hasTimeoutAbortInCauseChain(e)) {
    return new LLMCompletionError({
      message: `Request timed out after ${timeoutMs}ms`,
      responseStatusCode: 500,
      isRetryable: false,
      cause: e,
    });
  }

  return mapToLLMCompletionError(e);
}

function buildToolSet(tools: LLMToolDefinition[]): ToolSet {
  // No `execute` functions: the SDK returns tool calls to the caller instead
  // of running a tool loop, matching the LangChain bindTools behavior.
  return Object.fromEntries(
    tools.map((toolDefinition) => [
      toolDefinition.name,
      tool({
        description: toolDefinition.description,
        inputSchema: jsonSchema(
          toolDefinition.parameters as Parameters<typeof jsonSchema>[0],
        ),
      }),
    ]),
  );
}

function toFlexibleSchema(schema: ZodType | LLMJSONSchema) {
  // The standard-schema marker also catches zod schemas constructed from a
  // different zod copy, where instanceof would fail.
  const isStandardSchema =
    schema instanceof ZodType || "~standard" in (schema as object);
  return isStandardSchema
    ? (schema as ZodType)
    : jsonSchema(schema as Parameters<typeof jsonSchema>[0]);
}

function executeStreaming(args: {
  baseOptions: BaseCallOptions;
  timeoutMs: number;
  capture: AiSdkTelemetryCapture | undefined;
  runInTraceContext: <T>(fn: () => T) => T;
}): IterableReadableStream<Uint8Array> {
  const { baseOptions, timeoutMs, capture, runInTraceContext } = args;

  async function* byteStream(): AsyncGenerator<Uint8Array> {
    const encoder = new TextEncoder();
    let completedText = "";
    try {
      const result = runInTraceContext(() => streamText(baseOptions));
      for await (const textChunk of result.textStream) {
        completedText += textChunk;

        yield encoder.encode(textChunk);
      }
      capture?.setRootOutput(completedText);
    } catch (e) {
      throw toCompletionError(e, timeoutMs);
    } finally {
      await capture?.flush();
    }
  }

  return IterableReadableStream.fromAsyncGenerator(byteStream());
}
