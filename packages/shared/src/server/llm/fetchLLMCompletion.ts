// We need to use Zod3 for structured outputs due to a bug in
// ChatVertexAI. See issue: https://github.com/langfuse/langfuse/issues/7429
import { type ZodSchema } from "zod/v3";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatBedrockConverse } from "@langchain/aws";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI, AzureChatOpenAI } from "@langchain/openai";
import GCPServiceAccountKeySchema, {
  BedrockConfigSchema,
  BedrockCredentialSchema,
  VertexAIConfigSchema,
} from "../../interfaces/customLLMProviderConfigSchemas";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  LLMJSONSchema,
  LLMToolDefinition,
  ModelParams,
  ToolCallResponse,
  ToolCallResponseSchema,
  TraceParams,
} from "./types";
import { CallbackHandler } from "langfuse-langchain";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";

type ProcessTracedEvents = () => Promise<void>;

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  structuredOutputSchema?: ZodSchema | LLMJSONSchema;
  callbacks?: BaseCallbackHandler[];
  baseURL?: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
  maxRetries?: number;
  config?: Record<string, string> | null;
  traceParams?: TraceParams;
  throwOnError?: boolean; // default is true
};

type FetchLLMCompletionParams = LLMCompletionParams & {
  streaming: boolean;
  tools?: LLMToolDefinition[];
};

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: true;
  },
): Promise<{
  completion: IterableReadableStream<Uint8Array>;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: false;
  },
): Promise<{
  completion: string;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  },
): Promise<{
  completion: Record<string, unknown>;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    tools: LLMToolDefinition[];
    streaming: false;
  },
): Promise<{
  completion: ToolCallResponse;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams,
): Promise<{
  completion:
    | string
    | IterableReadableStream<Uint8Array>
    | Record<string, unknown>
    | ToolCallResponse;
  processTracedEvents: ProcessTracedEvents;
}> {
  // the apiKey must never be printed to the console
  const {
    messages,
    tools,
    modelParams,
    streaming,
    callbacks,
    apiKey,
    baseURL,
    maxRetries,
    config,
    traceParams,
    extraHeaders,
    throwOnError = true,
  } = params;

  let finalCallbacks: BaseCallbackHandler[] | undefined = callbacks ?? [];
  let processTracedEvents: ProcessTracedEvents = () => Promise.resolve();

  if (traceParams) {
    const handler = new CallbackHandler({
      _projectId: traceParams.projectId,
      _isLocalEventExportEnabled: true,
      environment: traceParams.environment,
    });
    finalCallbacks.push(handler);

    processTracedEvents = async () => {
      try {
        const events = await handler.langfuse._exportLocalEvents(
          traceParams.projectId,
        );
        await processEventBatch(
          JSON.parse(JSON.stringify(events)), // stringify to emulate network event batch from network call
          traceParams.authCheck,
          { isLangfuseInternal: true },
        );
      } catch (e) {
        logger.error("Failed to process traced events", { error: e });
      }
    };
  }

  finalCallbacks = finalCallbacks.length > 0 ? finalCallbacks : undefined;

  // Helper function to safely stringify content
  const safeStringify = (content: any): string => {
    try {
      return JSON.stringify(content);
    } catch {
      return "[Unserializable content]";
    }
  };

  let finalMessages: BaseMessage[];
  // VertexAI requires at least 1 user message
  if (modelParams.adapter === LLMAdapter.VertexAI && messages.length === 1) {
    const safeContent =
      typeof messages[0].content === "string"
        ? messages[0].content
        : JSON.stringify(messages[0].content);
    finalMessages = [new HumanMessage(safeContent)];
  } else {
    finalMessages = messages.map((message) => {
      // For arbitrary content types, convert to string safely
      const safeContent =
        typeof message.content === "string"
          ? message.content
          : safeStringify(message.content);

      if (message.role === ChatMessageRole.User)
        return new HumanMessage(safeContent);
      if (
        message.role === ChatMessageRole.System ||
        message.role === ChatMessageRole.Developer
      )
        return new SystemMessage(safeContent);

      if (message.type === ChatMessageType.ToolResult) {
        return new ToolMessage({
          content: safeContent,
          tool_call_id: message.toolCallId,
        });
      }

      return new AIMessage({
        content: safeContent,
        tool_calls:
          message.type === ChatMessageType.AssistantToolCall
            ? (message.toolCalls as any)
            : undefined,
      });
    });
  }

  finalMessages = finalMessages.filter(
    (m) => m.content.length > 0 || "tool_calls" in m,
  );

  let chatModel:
    | ChatOpenAI
    | ChatAnthropic
    | ChatBedrockConverse
    | ChatVertexAI
    | ChatGoogleGenerativeAI;
  if (modelParams.adapter === LLMAdapter.Anthropic) {
    chatModel = new ChatAnthropic({
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      clientOptions: { maxRetries, timeout: 1000 * 60 * 2 }, // 2 minutes timeout
    });
  } else if (modelParams.adapter === LLMAdapter.OpenAI) {
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      streamUsage: false, // https://github.com/langchain-ai/langchainjs/issues/6533
      callbacks: finalCallbacks,
      maxRetries,
      configuration: {
        baseURL,
        defaultHeaders: extraHeaders,
      },
      timeout: 1000 * 60 * 2, // 2 minutes timeout
    });
  } else if (modelParams.adapter === LLMAdapter.Azure) {
    chatModel = new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIBasePath: baseURL,
      azureOpenAIApiDeploymentName: modelParams.model,
      azureOpenAIApiVersion: "2025-02-01-preview",
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      timeout: 1000 * 60 * 2, // 2 minutes timeout
      configuration: {
        defaultHeaders: extraHeaders,
      },
    });
  } else if (modelParams.adapter === LLMAdapter.Bedrock) {
    const { region } = BedrockConfigSchema.parse(config);
    const credentials = BedrockCredentialSchema.parse(JSON.parse(apiKey));

    chatModel = new ChatBedrockConverse({
      model: modelParams.model,
      region,
      credentials,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      timeout: 1000 * 60 * 2, // 2 minutes timeout
    });
  } else if (modelParams.adapter === LLMAdapter.VertexAI) {
    const credentials = GCPServiceAccountKeySchema.parse(JSON.parse(apiKey));
    const { location } = config
      ? VertexAIConfigSchema.parse(config)
      : { location: undefined };

    // Requests time out after 60 seconds for both public and private endpoints by default
    // Reference: https://cloud.google.com/vertex-ai/docs/predictions/get-online-predictions#send-request
    chatModel = new ChatVertexAI({
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      location,
      authOptions: {
        projectId: credentials.project_id,
        credentials,
      },
    });
  } else if (modelParams.adapter === LLMAdapter.GoogleAIStudio) {
    chatModel = new ChatGoogleGenerativeAI({
      model: modelParams.model,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      apiKey,
    });
  } else if (modelParams.adapter === LLMAdapter.Atla) {
    // Atla models do not support:
    // - temperature
    // - max_tokens
    // - top_p
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      callbacks: finalCallbacks,
      maxRetries,
      configuration: {
        baseURL: baseURL,
        defaultHeaders: extraHeaders,
      },
      timeout: 1000 * 60, // 1 minute timeout
    });
  } else {
    // eslint-disable-next-line no-unused-vars
    const _exhaustiveCheck: never = modelParams.adapter;
    throw new Error(
      `This model provider is not supported: ${_exhaustiveCheck}`,
    );
  }

  const runConfig = {
    callbacks: finalCallbacks,
    runId: traceParams?.traceId,
    runName: traceParams?.traceName,
  };

  try {
    if (params.structuredOutputSchema) {
      return {
        completion: await (chatModel as ChatOpenAI) // Typecast necessary due to https://github.com/langchain-ai/langchainjs/issues/6795
          .withStructuredOutput(params.structuredOutputSchema)
          .invoke(finalMessages, runConfig),
        processTracedEvents,
      };
    }

    /*
  Workaround OpenAI reasoning models:

  This is a temporary workaround to avoid sending unsupported parameters to OpenAI's O1 models.
  O1 models do not support:
  - system messages
  - top_p
  - max_tokens at all, one has to use max_completion_tokens instead
  - temperature different than 1

  Reference: https://platform.openai.com/docs/guides/reasoning/beta-limitations
  */
    if (
      modelParams.model.startsWith("o1-") ||
      modelParams.model.startsWith("o3-")
    ) {
      const filteredMessages = finalMessages.filter((message) => {
        return (
          modelParams.model.startsWith("o3-") || message._getType() !== "system"
        );
      });

      return {
        completion: await new ChatOpenAI({
          openAIApiKey: apiKey,
          modelName: modelParams.model,
          temperature: 1,
          maxTokens: undefined,
          topP: undefined,
          callbacks,
          maxRetries,
          modelKwargs: {
            max_completion_tokens: modelParams.max_tokens,
          },
          configuration: {
            baseURL,
          },
          timeout: 1000 * 60 * 2, // 2 minutes timeout
        })
          .pipe(new StringOutputParser())
          .invoke(filteredMessages, runConfig),
        processTracedEvents,
      };
    }

    if (tools && tools.length > 0) {
      const langchainTools = tools.map((tool) => ({
        type: "function",
        function: tool,
      }));

      const result = await chatModel
        .bindTools(langchainTools)
        .invoke(finalMessages, runConfig);

      const parsed = ToolCallResponseSchema.safeParse(result);
      if (!parsed.success) throw Error("Failed to parse LLM tool call result");

      return {
        completion: parsed.data,
        processTracedEvents,
      };
    }

    if (streaming) {
      return {
        completion: await chatModel
          .pipe(new BytesOutputParser())
          .stream(finalMessages, runConfig),
        processTracedEvents,
      };
    }

    return {
      completion: await chatModel
        .pipe(new StringOutputParser())
        .invoke(finalMessages, runConfig),
      processTracedEvents,
    };
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    return { completion: "", processTracedEvents };
  }
}
