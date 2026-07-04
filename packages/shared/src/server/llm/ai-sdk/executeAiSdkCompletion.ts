import {
  generateText,
  jsonSchema,
  Output,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import type { ZodType } from "zod";

import type { LLMConnectionConfig } from "../../../interfaces/customLLMProviderConfigSchemas";
import { LLMCompletionError } from "../errors";
import { mapUnknownErrorToLLMCompletionError } from "../errorMapping";
import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
  type LLMJSONSchema,
  type LLMToolDefinition,
  type ModelParams,
  type ToolCallResponse,
  ToolCallResponseSchema,
  type TraceSinkParams,
} from "../types";
import { executeWithRuntimeTimeout, RUNTIME_TIMEOUT_ADAPTERS } from "../utils";
import { getUnsupportedOpenAIProviderOptionKeys } from "./providerOptionsTranslation";
import { resolveOpenAIModel } from "./providers/openai";
import { createAiSdkTelemetryContext } from "./telemetry";

type ExecuteAiSdkCompletionParams = {
  messages: ChatMessage[];
  tools?: LLMToolDefinition[];
  modelParams: ModelParams;
  streaming: boolean;
  llmConnection: {
    apiKey: string;
    extraHeaders?: Record<string, string>;
    baseURL?: string | null;
    config?: LLMConnectionConfig | null;
  };
  structuredOutputSchema?: ZodType | LLMJSONSchema;
  maxRetries?: number;
  timeoutMs: number;
  traceSinkParams?: TraceSinkParams;
  secureFetch: typeof globalThis.fetch;
};

export async function executeAiSdkCompletion(
  params: ExecuteAiSdkCompletionParams,
): Promise<
  | string
  | { text: string; reasoning?: string }
  | IterableReadableStream<Uint8Array>
  | Record<string, unknown>
  | (ToolCallResponse & { reasoning?: string })
> {
  assertOpenAIProviderOptionsTranslated(params.modelParams.providerOptions);

  const modelResolution = resolveOpenAIModel({
    apiKey: params.llmConnection.apiKey,
    baseURL: params.llmConnection.baseURL,
    config: params.llmConnection.config,
    extraHeaders: params.llmConnection.extraHeaders,
    fetch: params.secureFetch,
    modelParams: params.modelParams,
  });
  const telemetryContext = createAiSdkTelemetryContext({
    traceSinkParams: params.traceSinkParams,
    rootSpanAttributes: modelResolution.metadata,
  });
  const aiMessages = mapMessagesToAiSdkMessages(params.messages);
  const aiTools = params.tools?.length
    ? buildAiSdkToolSet(params.tools)
    : undefined;

  if (params.streaming) {
    return createStreamingCompletion({
      params,
      aiMessages,
      aiTools,
      modelResolution,
      telemetryContext,
    });
  }

  const scope = telemetryContext.startScope();
  const runtimeTimeoutController = new AbortController();
  try {
    const result = await executeWithRuntimeTimeout<
      Awaited<ReturnType<typeof generateText>>
    >({
      enabled: RUNTIME_TIMEOUT_ADAPTERS.has(params.modelParams.adapter),
      timeoutMs: params.timeoutMs,
      abortController: runtimeTimeoutController,
      operation: () => {
        return scope.run(() =>
          generateText({
            ...buildCommonGenerateTextArgs({
              params,
              aiMessages,
              modelResolution,
              telemetryContext,
              abortSignal: runtimeTimeoutController.signal,
            }),
            tools: aiTools,
            toolChoice: aiTools ? "auto" : undefined,
            output: params.structuredOutputSchema
              ? Output.object({
                  schema: toAiSdkSchema(params.structuredOutputSchema),
                })
              : undefined,
          } as any),
        );
      },
    });

    scope.end();

    if (params.structuredOutputSchema) {
      return (result as any).output as Record<string, unknown>;
    }

    if (params.tools && params.tools.length > 0) {
      return parseToolCallResponse(result as any);
    }

    return normalizeTextResult(result as any);
  } catch (error) {
    scope.end(error);
    throw mapUnknownErrorToLLMCompletionError(error);
  } finally {
    await telemetryContext.flushAndPublish();
  }
}

async function createStreamingCompletion(params: {
  params: ExecuteAiSdkCompletionParams;
  aiMessages: ModelMessage[];
  aiTools?: ToolSet;
  modelResolution: ReturnType<typeof resolveOpenAIModel>;
  telemetryContext: ReturnType<typeof createAiSdkTelemetryContext>;
}): Promise<IterableReadableStream<Uint8Array>> {
  const {
    params: executeParams,
    aiMessages,
    aiTools,
    modelResolution,
    telemetryContext,
  } = params;
  const scope = telemetryContext.startScope();
  const runtimeTimeoutController = new AbortController();

  try {
    const result = await executeWithRuntimeTimeout<
      ReturnType<typeof streamText>
    >({
      enabled: RUNTIME_TIMEOUT_ADAPTERS.has(executeParams.modelParams.adapter),
      timeoutMs: executeParams.timeoutMs,
      abortController: runtimeTimeoutController,
      operation: () =>
        Promise.resolve(
          scope.run(() =>
            streamText({
              ...buildCommonGenerateTextArgs({
                params: executeParams,
                aiMessages,
                modelResolution,
                telemetryContext,
                abortSignal: runtimeTimeoutController.signal,
              }),
              tools: aiTools,
              toolChoice: aiTools ? "auto" : undefined,
            } as any),
          ),
        ),
    });

    const iterator = result.textStream[Symbol.asyncIterator]();
    const encoder = new TextEncoder();

    return IterableReadableStream.fromAsyncGenerator(
      (async function* () {
        try {
          while (true) {
            const next = await scope.run(() => iterator.next());
            if (next.done) break;
            yield encoder.encode(next.value);
          }
          scope.end();
        } catch (error) {
          scope.end(error);
          throw mapUnknownErrorToLLMCompletionError(error);
        } finally {
          await iterator.return?.();
          scope.end();
          await telemetryContext.flushAndPublish();
        }
      })(),
    );
  } catch (error) {
    scope.end(error);
    await telemetryContext.flushAndPublish();
    throw mapUnknownErrorToLLMCompletionError(error);
  }
}

function buildCommonGenerateTextArgs(params: {
  params: ExecuteAiSdkCompletionParams;
  aiMessages: ModelMessage[];
  modelResolution: ReturnType<typeof resolveOpenAIModel>;
  telemetryContext: ReturnType<typeof createAiSdkTelemetryContext>;
  abortSignal?: AbortSignal;
}) {
  const {
    params: executeParams,
    aiMessages,
    modelResolution,
    telemetryContext,
    abortSignal,
  } = params;

  return {
    model: modelResolution.model,
    messages: aiMessages,
    maxRetries: executeParams.maxRetries,
    abortSignal,
    timeout: executeParams.timeoutMs,
    temperature: executeParams.modelParams.temperature,
    topP: executeParams.modelParams.top_p,
    maxOutputTokens: executeParams.modelParams.max_tokens,
    providerOptions: modelResolution.providerOptions,
    telemetry: telemetryContext.telemetry,
    ...modelResolution.callSettings,
  };
}

function normalizeTextResult(result: {
  text: string;
  reasoningText?: string;
}): string | { text: string; reasoning?: string } {
  return result.reasoningText
    ? { text: result.text, reasoning: result.reasoningText }
    : result.text;
}

function parseToolCallResponse(result: {
  text: string;
  reasoningText?: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
}): ToolCallResponse & { reasoning?: string } {
  const parsed = ToolCallResponseSchema.safeParse({
    content: result.text,
    tool_calls: result.toolCalls.map((toolCall) => ({
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      args: toolCall.input,
    })),
  });

  if (!parsed.success) {
    throw new LLMCompletionError({
      message: "Failed to parse LLM tool call result",
      responseStatusCode: 500,
      isRetryable: false,
    });
  }

  return {
    ...parsed.data,
    ...(result.reasoningText ? { reasoning: result.reasoningText } : {}),
  };
}

function buildAiSdkToolSet(tools: LLMToolDefinition[]): ToolSet {
  return Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema(definition.parameters as any),
      }),
    ]),
  ) as ToolSet;
}

function mapMessagesToAiSdkMessages(messages: ChatMessage[]): ModelMessage[] {
  const toolCallNamesById = new Map<string, string>();
  const mapped = messages.map((message, index): ModelMessage => {
    const safeContent =
      typeof message.content === "string"
        ? message.content
        : safeStringify(message.content);

    if (message.role === ChatMessageRole.User) {
      return { role: "user", content: safeContent };
    }

    if (
      message.role === ChatMessageRole.System ||
      message.role === ChatMessageRole.Developer
    ) {
      return index === 0
        ? { role: "system", content: safeContent }
        : { role: "user", content: safeContent };
    }

    if (message.type === ChatMessageType.ToolResult) {
      const toolName = toolCallNamesById.get(message.toolCallId);
      if (!toolName) {
        throw new LLMCompletionError({
          message: `Tool result references unknown tool call id: ${message.toolCallId}`,
          responseStatusCode: 400,
          isRetryable: false,
        });
      }

      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName,
            output: { type: "text", value: safeContent },
          },
        ],
      };
    }

    if (message.type === ChatMessageType.AssistantToolCall) {
      const content = [
        ...(safeContent ? [{ type: "text" as const, text: safeContent }] : []),
        ...message.toolCalls.map((toolCall) => {
          toolCallNamesById.set(toolCall.id, toolCall.name);
          return {
            type: "tool-call" as const,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            input: toolCall.args,
          };
        }),
      ];

      return {
        role: "assistant",
        content,
      };
    }

    return { role: "assistant", content: safeContent };
  });

  return mapped.filter(hasMessageContent);
}

function hasMessageContent(message: ModelMessage): boolean {
  if (typeof message.content === "string") {
    return message.content.length > 0;
  }
  return message.content.length > 0;
}

function toAiSdkSchema(schema: ZodType | LLMJSONSchema) {
  return isZodSchema(schema) ? schema : jsonSchema(schema as any);
}

function isZodSchema(schema: ZodType | LLMJSONSchema): schema is ZodType {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "parse" in schema &&
    "_def" in schema
  );
}

function safeStringify(content: unknown): string {
  try {
    return JSON.stringify(content) ?? "[Unserializable content]";
  } catch {
    return "[Unserializable content]";
  }
}

function assertOpenAIProviderOptionsTranslated(
  providerOptions: Record<string, unknown> | undefined,
): void {
  const unsupportedKeys =
    getUnsupportedOpenAIProviderOptionKeys(providerOptions);
  if (unsupportedKeys.length === 0) return;

  throw new LLMCompletionError({
    message: `Unsupported AI SDK OpenAI provider options: ${unsupportedKeys.join(", ")}`,
    responseStatusCode: 400,
    isRetryable: false,
  });
}
