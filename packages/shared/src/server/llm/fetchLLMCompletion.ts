import { type ZodSchema, z } from "zod/v4";

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
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
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
import { ProxyAgent } from "undici";
import { getInternalTracingHandler } from "./getInternalTracingHandler";
import { decrypt } from "../../encryption";
import { decryptAndParseExtraHeaders } from "./utils";
import { logger } from "../logger";
import { LLMCompletionError } from "./errors";

export type CompletionWithReasoning = { text: string; reasoning?: string };

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

// Maps adapters to the content block types that represent "thinking".
// Used to extract reasoning separately and strip thinking parts from parsed output.
const THINKING_BLOCK_TYPES: Partial<Record<LLMAdapter, Set<string>>> = {
  [LLMAdapter.VertexAI]: new Set(["reasoning"]),
  [LLMAdapter.GoogleAIStudio]: new Set(["reasoning"]),
};

function getThinkingBlockTypes(adapter: LLMAdapter): Set<string> | undefined {
  return THINKING_BLOCK_TYPES[adapter];
}

const PROVIDERS_WITH_REQUIRED_USER_MESSAGE = [
  LLMAdapter.VertexAI,
  LLMAdapter.GoogleAIStudio,
  LLMAdapter.Anthropic,
  LLMAdapter.Bedrock,
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

const googleProviderOptionsSchema = z
  .object({
    thinkingBudget: z.number().optional(),
    thinkingLevel: z.string().optional(), // intentionally loose as types differ / may be extended in the future and are passed through to API
  })
  .optional();

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
  params: LLMCompletionParams & {
    streaming: true;
  },
): Promise<IterableReadableStream<Uint8Array>>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
  },
): Promise<string | CompletionWithReasoning>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  },
): Promise<Record<string, unknown>>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    tools: LLMToolDefinition[];
  },
): Promise<ToolCallResponse & { reasoning?: string }>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams,
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
    finalMessages = messages.map((message, idx) => {
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
        return idx === 0
          ? new SystemMessage(safeContent)
          : new HumanMessage(safeContent);

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
  const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const timeoutMs = env.LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS;

  let chatModel:
    | ChatOpenAI
    | ChatAnthropic
    | ChatBedrockConverse
    | ChatVertexAI
    | ChatGoogleGenerativeAI;
  if (modelParams.adapter === LLMAdapter.Anthropic) {
    const isClaude45Family =
      modelParams.model?.includes("claude-sonnet-4-5") ||
      modelParams.model?.includes("claude-opus-4-1") ||
      modelParams.model?.includes("claude-opus-4-5") ||
      modelParams.model?.includes("claude-opus-4-6") ||
      modelParams.model?.includes("claude-haiku-4-5");

    const chatOptions: Record<string, any> = {
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL ?? undefined,
      model: modelParams.model,
      maxTokens: modelParams.max_tokens,
      callbacks: finalCallbacks,
      clientOptions: {
        maxRetries,
        timeout: timeoutMs,
        ...(proxyDispatcher && {
          fetchOptions: { dispatcher: proxyDispatcher },
        }),
      },
      temperature: modelParams.temperature,
      topP: modelParams.top_p,
      invocationKwargs: modelParams.providerOptions,
      timeout: timeoutMs,
    };

    chatModel = new ChatAnthropic(chatOptions);

    if (isClaude45Family) {
      if (chatModel.topP === -1) {
        chatModel.topP = undefined;
      }

      // TopP and temperature cannot be specified both,
      // but Langchain is setting placeholder values despite that
      if (
        modelParams.temperature !== undefined &&
        modelParams.top_p === undefined
      ) {
        chatModel.topP = undefined;
      }

      if (
        modelParams.top_p !== undefined &&
        modelParams.temperature === undefined
      ) {
        chatModel.temperature = undefined;
      }
    }
  } else if (modelParams.adapter === LLMAdapter.OpenAI) {
    const processedBaseURL = processOpenAIBaseURL({
      url: baseURL,
      modelName: modelParams.model,
    });

    chatModel = new ChatOpenAI({
      apiKey,
      model: modelParams.model,
      temperature: modelParams.temperature,
      ...(isOpenAIReasoningModel(modelParams.model as OpenAIModel)
        ? { maxCompletionTokens: modelParams.max_tokens }
        : { maxTokens: modelParams.max_tokens }),
      topP: modelParams.top_p,
      streamUsage: false, // https://github.com/langchain-ai/langchainjs/issues/6533
      callbacks: finalCallbacks,
      maxRetries,
      configuration: {
        baseURL: processedBaseURL,
        timeout: timeoutMs,
        defaultHeaders: extraHeaders,
        ...(proxyDispatcher && {
          fetchOptions: { dispatcher: proxyDispatcher },
        }),
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
        timeout: timeoutMs,
        defaultHeaders: extraHeaders,
        ...(proxyDispatcher && {
          fetchOptions: { dispatcher: proxyDispatcher },
        }),
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
    const { location } = config
      ? VertexAIConfigSchema.parse(config)
      : { location: undefined };

    const googleProviderOptions = googleProviderOptionsSchema.parse(
      modelParams.providerOptions,
    );

    // Handle both explicit credentials and default provider chain (ADC)
    // Only allow default provider chain in self-hosted or internal AI features
    const shouldUseDefaultCredentials =
      apiKey === VERTEXAI_USE_DEFAULT_CREDENTIALS && !isLangfuseCloud;

    // When using ADC, authOptions must be undefined to use google-auth-library's default credential chain
    // This supports: GKE Workload Identity, Cloud Run service accounts, GCE metadata service, gcloud auth
    // Security: We intentionally ignore user-provided projectId when using ADC to prevent
    // privilege escalation attacks where users could access other GCP projects via the server's credentials
    const authOptions = shouldUseDefaultCredentials
      ? undefined // Always use ADC auto-detection, never allow user-specified projectId
      : {
          credentials: GCPServiceAccountKeySchema.parse(JSON.parse(apiKey)),
          projectId: GCPServiceAccountKeySchema.parse(JSON.parse(apiKey))
            .project_id,
        };

    // Requests time out after 60 seconds for both public and private endpoints by default
    // Reference: https://cloud.google.com/vertex-ai/docs/predictions/get-online-predictions#send-request
    chatModel = new ChatVertexAI({
      model: modelParams.model,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      location,
      authOptions,
      ...(modelParams.maxReasoningTokens !== undefined && {
        maxReasoningTokens: modelParams.maxReasoningTokens,
      }),
      ...((googleProviderOptions as any) ?? {}), // Typecast as thinkingLevel is intentionally looser typed
    });
  } else if (modelParams.adapter === LLMAdapter.GoogleAIStudio) {
    const googleProviderOptions = googleProviderOptionsSchema.parse(
      modelParams.providerOptions,
    );

    chatModel = new ChatGoogleGenerativeAI({
      model: modelParams.model,
      baseUrl: baseURL ?? undefined,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      apiKey,
      ...(googleProviderOptions
        ? {
            thinkingConfig: googleProviderOptions as any, // Typecast as thinkingLevel is intentionally looser typed
          }
        : {}),
    });
  } else {
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

  const thinkingTypes = getThinkingBlockTypes(modelParams.adapter);

  try {
    // Important: await all generations in the try block as otherwise `processTracedEvents` will run too early in finally block
    if (params.structuredOutputSchema) {
      // Thinking-capable adapters may produce reasoning blocks that corrupt JSON schema
      // parsing. Force function calling so the parser reads from tool_calls instead.
      const structuredOutputConfig =
        thinkingTypes != null
          ? { method: "functionCalling" as const }
          : undefined;

      const structuredOutput = await chatModel
        .withStructuredOutput(
          params.structuredOutputSchema,
          structuredOutputConfig,
        )
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

      // For thinking adapters, strip reasoning blocks from content before parsing
      // so ToolCallResponseSchema can validate. Extract reasoning separately.
      if (thinkingTypes != null && Array.isArray(result.content)) {
        const reasoning = extractReasoning(result.content, thinkingTypes);
        // mutates Langchain AIMessage in place, not ideal but safe because only used for parsing below
        result.content = result.content.filter(
          (block) =>
            typeof block === "string" || !thinkingTypes.has(block.type),
        );

        const parsed = ToolCallResponseSchema.safeParse(result);
        if (!parsed.success)
          throw Error("Failed to parse LLM tool call result");

        return {
          ...parsed.data,
          ...(reasoning ? { reasoning } : {}),
        };
      }

      const parsed = ToolCallResponseSchema.safeParse(result);
      if (!parsed.success) throw Error("Failed to parse LLM tool call result");

      return parsed.data;
    }

    if (streaming)
      return chatModel
        .pipe(new BytesOutputParser())
        .stream(finalMessages, runConfig);

    // content with thinking blocks can't be handled by StringOutputParser
    // Invoke model directly and extract text + reasoning separately.
    if (thinkingTypes != null) {
      const aiMessage = await chatModel.invoke(finalMessages, runConfig);
      return extractCompletionWithReasoning(aiMessage, thinkingTypes);
    }

    const completion = await chatModel
      .pipe(new StringOutputParser())
      .invoke(finalMessages, runConfig);

    return completion;
  } catch (e) {
    const responseStatusCode =
      (e as any)?.response?.status ?? (e as any)?.status ?? 500;
    const rawMessage = e instanceof Error ? e.message : String(e);
    const message = extractCleanErrorMessage(rawMessage);

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

// extracts reasoning text from an array of content blocks.
// returns concatenated reasoning or undefined if no reasoning blocks are found
function extractReasoning(
  content: AIMessage["content"],
  thinkingBlockTypes: Set<string>,
): string | undefined {
  if (typeof content === "string" || !Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== "string" && thinkingBlockTypes.has(block.type)) {
      const text = (block as any).text ?? (block as any).reasoning;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

/**
 * Splits AIMessage content into text and reasoning parts.
 * Text parts are concatenated into `text`, thinking-type parts into `reasoning`.
 */
function extractCompletionWithReasoning(
  message: AIMessage,
  thinkingBlockTypes: Set<string>,
): CompletionWithReasoning {
  const { content } = message;

  if (typeof content === "string") return { text: content };
  if (!Array.isArray(content)) return { text: String(content) };

  const reasoning = extractReasoning(content, thinkingBlockTypes);

  const textParts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      textParts.push(block);
    } else if (!thinkingBlockTypes.has(block.type)) {
      const text = (block as any).text ?? (block as any).reasoning;
      if (typeof text === "string") textParts.push(text);
    }
  }

  return {
    text: textParts.join(""),
    ...(reasoning ? { reasoning } : {}),
  };
}

/**
 * Process baseURL template for OpenAI adapter only.
 * Replaces {model} placeholder with actual model name.
 * This is a workaround for proxies that require the model name in the URL azureOpenAIBasePath
 * while having OpenAI compliance otherwise
 */
function processOpenAIBaseURL(params: {
  url: string | null | undefined;
  modelName: string;
}): string | null | undefined {
  const { url, modelName } = params;

  if (!url || !url.includes("{model}")) {
    return url;
  }

  return url.replace("{model}", modelName);
}

function extractCleanErrorMessage(rawMessage: string): string {
  // Try to parse JSON error format (common in Google/Vertex AI errors)
  // Example: '[{"error":{"code":404,"message":"Model not found..."}}]'
  try {
    // Check if the message starts with [ or { indicating JSON
    const trimmed = rawMessage.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);

      // Handle array format: [{"error": {"message": "..."}}]
      if (Array.isArray(parsed) && parsed[0]?.error?.message) {
        return parsed[0].error.message;
      }

      // Handle object format: {"error": {"message": "..."}}
      if (parsed?.error?.message) {
        return parsed.error.message;
      }

      // Handle direct message format: {"message": "..."}
      if (parsed?.message) {
        return parsed.message;
      }
    }
  } catch {
    // Not valid JSON, return as-is
  }

  return rawMessage;
}
