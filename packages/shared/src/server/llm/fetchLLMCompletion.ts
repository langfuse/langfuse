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
import { env } from "../../env";
import GCPServiceAccountKeySchema, {
  BedrockConfigSchema,
  BedrockCredentialSchema,
  VertexAIConfigSchema,
  BEDROCK_USE_DEFAULT_CREDENTIALS,
} from "../../interfaces/customLLMProviderConfigSchemas";
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  isOpenAIReasoningModel,
  LLMAdapter,
  LLMJSONSchema,
  LLMToolDefinition,
  ModelParams,
  OpenAIModel,
  ToolCallResponse,
  ToolCallResponseSchema,
  TraceSinkParams,
} from "./types";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getInternalTracingHandler } from "./getInternalTracingHandler";
import { decrypt } from "../../encryption";
import { decryptAndParseExtraHeaders } from "./utils";
import { logger } from "../logger";
import { LLMCompletionError } from "./errors";

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

const PROVIDERS_WITH_REQUIRED_USER_MESSAGE = [
  LLMAdapter.VertexAI,
  LLMAdapter.Anthropic,
];

const transformSystemMessageToUserMessage = (
  messages: ChatMessage[],
): BaseMessage[] => {
  const safeContent =
    typeof messages[0].content === "string"
      ? messages[0].content
      : JSON.stringify(messages[0].content);
  return [new HumanMessage(safeContent)];
};

type ProcessTracedEvents = () => Promise<void>;

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  llmConnection: {
    secretKey: string;
    extraHeaders?: string | null;
    baseURL?: string | null;
    config?: Record<string, string> | null;
  };
  structuredOutputSchema?: ZodSchema | LLMJSONSchema;
  callbacks?: BaseCallbackHandler[];
  maxRetries?: number;
  traceSinkParams?: TraceSinkParams;
  shouldUseLangfuseAPIKey?: boolean;
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
): Promise<IterableReadableStream<Uint8Array>>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: false;
  },
): Promise<string>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  },
): Promise<Record<string, unknown>>;

export async function fetchLLMCompletion(
  // eslint-disable-next-line no-unused-vars
  params: LLMCompletionParams & {
    streaming: false;
    tools: LLMToolDefinition[];
  },
): Promise<ToolCallResponse>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams,
): Promise<
  | string
  | IterableReadableStream<Uint8Array>
  | Record<string, unknown>
  | ToolCallResponse
> {
  const {
    messages,
    tools,
    modelParams,
    streaming,
    callbacks,
    llmConnection,
    maxRetries,
    traceSinkParams,
    shouldUseLangfuseAPIKey = false,
  } = params;

  const { baseURL, config } = llmConnection;
  const apiKey = decrypt(llmConnection.secretKey); // the apiKey must never be printed to the console
  const extraHeaders = decryptAndParseExtraHeaders(llmConnection.extraHeaders);

  let finalCallbacks: BaseCallbackHandler[] | undefined = callbacks ?? [];
  let processTracedEvents: ProcessTracedEvents = () => Promise.resolve();

  if (traceSinkParams) {
    // Safeguard: All internal traces must use LangfuseInternalTraceEnvironment enum values
    // This prevents infinite eval loops (user trace → eval → eval trace → another eval)
    // See corresponding check in worker/src/features/evaluation/evalService.ts createEvalJobs()
    if (!traceSinkParams.environment?.startsWith("langfuse")) {
      logger.warn(
        "Skipping trace creation: internal traces must use LangfuseInternalTraceEnvironment enum",
        {
          environment: traceSinkParams.environment,
          traceId: traceSinkParams.traceId,
        },
      );
    } else {
      const internalTracingHandler = getInternalTracingHandler(traceSinkParams);
      processTracedEvents = internalTracingHandler.processTracedEvents;

      finalCallbacks.push(internalTracingHandler.handler);
    }
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
  // Some providers require at least 1 user message
  if (
    messages.length === 1 &&
    PROVIDERS_WITH_REQUIRED_USER_MESSAGE.includes(modelParams.adapter)
  ) {
    // Ensure provider schema compliance
    finalMessages = transformSystemMessageToUserMessage(messages);
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

  // Common proxy configuration for all adapters
  const proxyUrl = env.HTTPS_PROXY;
  const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  const timeoutMs = env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS;

  let chatModel:
    | ChatOpenAI
    | ChatAnthropic
    | ChatBedrockConverse
    | ChatVertexAI
    | ChatGoogleGenerativeAI;
  if (modelParams.adapter === LLMAdapter.Anthropic) {
    chatModel = new ChatAnthropic({
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL ?? undefined,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      clientOptions: {
        maxRetries,
        timeout: timeoutMs,
        ...(proxyAgent && { httpAgent: proxyAgent }),
      },
      invocationKwargs: modelParams.providerOptions,
    });
  } else if (modelParams.adapter === LLMAdapter.OpenAI) {
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      ...(isOpenAIReasoningModel(modelParams.model as OpenAIModel)
        ? { maxCompletionTokens: modelParams.max_tokens }
        : { maxTokens: modelParams.max_tokens }),
      topP: modelParams.top_p,
      streamUsage: false, // https://github.com/langchain-ai/langchainjs/issues/6533
      callbacks: finalCallbacks,
      maxRetries,
      configuration: {
        baseURL,
        defaultHeaders: extraHeaders,
        ...(proxyAgent && { httpAgent: proxyAgent }),
      },
      modelKwargs: modelParams.providerOptions,
      timeout: timeoutMs,
    });
  } else if (modelParams.adapter === LLMAdapter.Azure) {
    chatModel = new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIBasePath: baseURL ?? undefined,
      azureOpenAIApiDeploymentName: modelParams.model,
      azureOpenAIApiVersion: "2025-02-01-preview",
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      timeout: timeoutMs,
      configuration: {
        defaultHeaders: extraHeaders,
        ...(proxyAgent && { httpAgent: proxyAgent }),
      },
      modelKwargs: modelParams.providerOptions,
    });
  } else if (modelParams.adapter === LLMAdapter.Bedrock) {
    const { region } = shouldUseLangfuseAPIKey
      ? { region: env.LANGFUSE_AWS_BEDROCK_REGION }
      : BedrockConfigSchema.parse(config);

    // Handle both explicit credentials and default provider chain
    // Only allow default provider chain in self-hosted or internal AI features
    const isSelfHosted = !isLangfuseCloud;
    const credentials =
      apiKey === BEDROCK_USE_DEFAULT_CREDENTIALS &&
      (isSelfHosted || shouldUseLangfuseAPIKey)
        ? undefined // undefined = use AWS SDK default credential provider chain
        : BedrockCredentialSchema.parse(JSON.parse(apiKey));

    chatModel = new ChatBedrockConverse({
      model: modelParams.model,
      region,
      credentials,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      timeout: timeoutMs,
      additionalModelRequestFields: modelParams.providerOptions as any,
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
  } else {
    // eslint-disable-next-line no-unused-vars
    const _exhaustiveCheck: never = modelParams.adapter;
    throw new Error(
      `This model provider is not supported: ${_exhaustiveCheck}`,
    );
  }

  const runConfig = {
    callbacks: finalCallbacks,
    runId: traceSinkParams?.traceId,
    runName: traceSinkParams?.traceName,
    metadata: traceSinkParams?.metadata,
  };

  try {
    // Important: await all generations in the try block as otherwise `processTracedEvents` will run too early in finally block
    if (params.structuredOutputSchema) {
      const structuredOutput = await (chatModel as ChatOpenAI) // Typecast necessary due to https://github.com/langchain-ai/langchainjs/issues/6795
        .withStructuredOutput(params.structuredOutputSchema)
        .invoke(finalMessages, runConfig);

      return structuredOutput;
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

      return parsed.data;
    }

    if (streaming)
      return chatModel
        .pipe(new BytesOutputParser())
        .stream(finalMessages, runConfig);

    const completion = await chatModel
      .pipe(new StringOutputParser())
      .invoke(finalMessages, runConfig);

    return completion;
  } catch (e) {
    const responseStatusCode =
      (e as any)?.response?.status ?? (e as any)?.status ?? 500;
    const message = e instanceof Error ? e.message : String(e);

    // Check for non-retryable error patterns in message
    const nonRetryablePatterns = [
      "Request timed out",
      "is not valid JSON",
      "Unterminated string in JSON at position",
      "TypeError",
    ];

    const hasNonRetryablePattern = nonRetryablePatterns.some((pattern) =>
      message.includes(pattern),
    );

    // Determine retryability:
    // - 429 (rate limit): retryable with custom delay
    // - 5xx (server errors): retryable with custom delay
    // - 4xx (client errors): not retryable
    // - Non-retryable patterns: not retryable
    let isRetryable = false;

    if (
      e instanceof Error &&
      (e.name === "InsufficientQuotaError" || e.name === "ThrottlingException")
    ) {
      // Explicit 429 handling
      isRetryable = true;
    } else if (responseStatusCode >= 500) {
      // 5xx errors are retryable (server issues)
      isRetryable = true;
    } else if (responseStatusCode === 429) {
      // Rate limit is retryable
      isRetryable = true;
    }

    // Override if error message indicates non-retryable issue
    if (hasNonRetryablePattern) {
      isRetryable = false;
    }

    throw new LLMCompletionError({
      message,
      responseStatusCode,
      isRetryable,
    });
  } finally {
    await processTracedEvents();
  }
}
