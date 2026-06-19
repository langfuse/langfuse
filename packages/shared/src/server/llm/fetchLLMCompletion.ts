import { type ZodType, z } from "zod";

import {
  AnthropicVertex,
  type ClientOptions as AnthropicVertexClientOptions,
} from "@anthropic-ai/vertex-sdk";
import { ChatAnthropic, ChatAnthropicInput } from "@langchain/anthropic";
import { ChatGoogle } from "@langchain/google";
import { ChatBedrockConverse } from "@langchain/aws";
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  ContentBlock,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ContextOverflowError } from "@langchain/core/errors";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI, AzureChatOpenAI } from "@langchain/openai";
import { env } from "../../env";
import GCPServiceAccountKeySchema, {
  BedrockAccessKeysSchema,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  LLMConnectionConfig,
  OpenAIConfigSchema,
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
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import { getInternalTracingHandler } from "./getInternalTracingHandler";
import { decrypt } from "../../encryption";
import {
  decryptAndParseExtraHeaders,
  executeWithRuntimeTimeout,
  RUNTIME_TIMEOUT_ADAPTERS,
} from "./utils";
import { logger } from "../logger";
import { LLMCompletionError } from "./errors";
import {
  createSecureGoogleAIStudioApiClient,
  createSecureVertexAIApiClient,
} from "./googleSecureApiClient";
import { createSecureLlmFetch } from "./secureLlmFetch";

export type CompletionWithReasoning = { text: string; reasoning?: string };
type SplitAIMessageContent = {
  text: string;
  // Standard `ContentBlock` shape exposed by `AIMessage#contentBlocks`, stripped
  // of `tool_call` and `reasoning` blocks. A plain string is preserved when the
  // upstream message carried plain-string content.
  contentWithoutThinking: string | Array<ContentBlock.Standard>;
  reasoning?: string;
};

const NON_RETRYABLE_LLM_ERROR_PATTERNS = [
  "Request timed out",
  "is not valid JSON",
  "Unterminated string in JSON at position",
  "TypeError",
  "reached the end of its life",
  "prompt is too long",
  // secureLlmFetch validation failures: synchronous, status-less errors that
  // would otherwise default to 500 + retryable and burn the eval-retry budget
  // on permanent config or redirect-target failures.
  "Only HTTP and HTTPS protocols are allowed",
  "Only HTTPS base URLs are allowed",
  "Blocked hostname detected",
  "Blocked IP address detected",
  "Redirect validation failed",
  "Maximum redirects",
  "Circular redirect detected",
] as const;

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
const AZURE_OPENAI_API_KEY_HEADER = "api-key";
const ANTHROPIC_API_KEY_HEADER = "x-api-key";
const VERTEX_AI_AUTH_HEADER = "authorization";
const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

// Adapters whose models can return separate reasoning content. We route their
// responses through `AIMessage#contentBlocks`, which normalizes provider-specific
// shapes (Bedrock `reasoning_content`, Gemini `{ thought: true }` text parts, etc.)
// into the documented `{ type: "reasoning", reasoning: string }` standard block.
const ADAPTERS_WITH_REASONING_SUPPORT = new Set<LLMAdapter>([
  LLMAdapter.Bedrock,
  LLMAdapter.VertexAI,
  LLMAdapter.GoogleAIStudio,
]);

function adapterSupportsReasoning(adapter: LLMAdapter): boolean {
  return ADAPTERS_WITH_REASONING_SUPPORT.has(adapter);
}

const PROVIDERS_WITH_REQUIRED_USER_MESSAGE = [
  LLMAdapter.VertexAI,
  LLMAdapter.GoogleAIStudio,
  LLMAdapter.Anthropic,
  LLMAdapter.Bedrock,
];

const ANTHROPIC_ALWAYS_ADAPTIVE_THINKING_MODELS = [
  "claude-fable-5",
  "claude-mythos-5",
] as const;

const ANTHROPIC_SAMPLING_PARAM_NORMALIZATION_MODELS = [
  "claude-fable-5",
  "claude-mythos-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4-1",
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-haiku-4-5",
] as const;

const ANTHROPIC_VERTEX_MODEL_NAME_PATTERN = /^[A-Za-z0-9_.@-]+$/;

// Vertex region identifiers are lowercase alphanumerics plus hyphens
// (e.g. "us-east5", "europe-west1") with the special "global"/"us"/"eu"
// endpoints. Disallowing every URL delimiter keeps an attacker-controlled
// location from reshaping the Vertex host the SDKs build from it.
const VERTEX_LOCATION_PATTERN = /^[a-z0-9-]+$/;

function isAnthropicAlwaysAdaptiveThinkingModel(modelName: string): boolean {
  return ANTHROPIC_ALWAYS_ADAPTIVE_THINKING_MODELS.some((model) =>
    modelName.includes(model),
  );
}

function shouldNormalizeAnthropicSamplingParams(modelName: string): boolean {
  return ANTHROPIC_SAMPLING_PARAM_NORMALIZATION_MODELS.some((model) =>
    modelName.includes(model),
  );
}

function getAnthropicInvocationKwargs(modelParams: ModelParams) {
  if (!isAnthropicAlwaysAdaptiveThinkingModel(modelParams.model)) {
    return modelParams.providerOptions;
  }

  return {
    // @langchain/anthropic currently defaults ChatAnthropic.thinking to
    // { type: "disabled" } and serializes it into every request.
    // Claude Fable 5 and Claude Mythos 5 reject that explicit disabled
    // mode because thinking defaults to adaptive when the field is
    // omitted. Newer ChatAnthropic versions might fix this default, but
    // remove this guard only after a developer has verified that the
    // pinned/newer version no longer sends thinking.disabled by default.
    thinking: undefined,
    ...modelParams.providerOptions,
  };
}

function normalizeAnthropicSamplingParams(
  chatModel: ChatAnthropic,
  modelParams: ModelParams,
) {
  if (!shouldNormalizeAnthropicSamplingParams(modelParams.model)) {
    return;
  }

  if (chatModel.topP === -1) {
    chatModel.topP = undefined;
  }

  // TopP and temperature cannot be specified both,
  // but Langchain is setting placeholder values despite that.
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

function isClaudeModel(modelName: string): boolean {
  return modelName.toLowerCase().includes("claude");
}

function assertValidAnthropicVertexModelName(modelName: string) {
  if (
    !ANTHROPIC_VERTEX_MODEL_NAME_PATTERN.test(modelName) ||
    modelName.includes("..")
  ) {
    throw new Error(
      "Invalid Anthropic Vertex AI model name. Model names must be a single Vertex model ID segment.",
    );
  }
}

function shouldNormalizeContentBlocks(modelParams: ModelParams): boolean {
  return (
    adapterSupportsReasoning(modelParams.adapter) ||
    (modelParams.adapter === LLMAdapter.Anthropic &&
      isAnthropicAlwaysAdaptiveThinkingModel(modelParams.model))
  );
}

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

// For using Bedrock API key in Bearer token format
const createBedrockBearerAuth = (token: string) => ({
  clientOptions: {
    token: { token },
    authSchemePreference: ["httpBearerAuth"],
  },
});

export function resolveBedrockAuth(params: {
  secretKey: string;
  allowDefaultCredentials: boolean;
}): {
  credentials?: z.infer<typeof BedrockAccessKeysSchema>;
  clientOptions?: {
    token: { token: string };
    authSchemePreference: string[];
  };
} {
  const { secretKey, allowDefaultCredentials } = params;

  if (
    secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS &&
    allowDefaultCredentials
  ) {
    return {};
  }

  try {
    const parsedCredential = BedrockCredentialSchema.parse(
      JSON.parse(secretKey),
    );

    if ("apiKey" in parsedCredential) {
      return createBedrockBearerAuth(parsedCredential.apiKey);
    }

    return {
      credentials: parsedCredential,
    };
  } catch {
    throw new Error(
      "Invalid Bedrock credentials. Expected AWS access key JSON or a Bedrock API key.",
    );
  }
}

type ProcessTracedEvents = () => Promise<void>;

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  llmConnection: {
    secretKey: string;
    extraHeaders?: string | null;
    baseURL?: string | null;
    config?: LLMConnectionConfig | null;
  };
  structuredOutputSchema?: ZodType | LLMJSONSchema;
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
    structuredOutputSchema: ZodType;
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
  const secureLlmFetch = (
    logContext: string,
    additionalSensitiveHeaders?: string[],
  ) =>
    createSecureLlmFetch({
      logContext,
      additionalSensitiveHeaders,
      dispatcher: proxyDispatcher,
    });

  let chatModel: ChatOpenAI | ChatAnthropic | ChatBedrockConverse | ChatGoogle;
  let usesOpenAIResponsesApi = false;
  if (modelParams.adapter === LLMAdapter.Anthropic) {
    const chatOptions: ChatAnthropicInput = {
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL ?? undefined,
      model: modelParams.model,
      maxTokens: modelParams.max_tokens,
      callbacks: finalCallbacks,
      clientOptions: {
        maxRetries,
        defaultHeaders: extraHeaders,
        timeout: timeoutMs,
        fetch: secureLlmFetch("Anthropic LLM base URL", [
          ANTHROPIC_API_KEY_HEADER,
        ]),
      },
      temperature: modelParams.temperature,
      topP: modelParams.top_p,
      invocationKwargs: getAnthropicInvocationKwargs(modelParams),
    };

    chatModel = new ChatAnthropic(chatOptions);
    normalizeAnthropicSamplingParams(chatModel, modelParams);
  } else if (modelParams.adapter === LLMAdapter.OpenAI) {
    const processedBaseURL = processOpenAIBaseURL({
      url: baseURL,
      modelName: modelParams.model,
    });
    const openAIConfig = OpenAIConfigSchema.parse(config ?? {});
    usesOpenAIResponsesApi = openAIConfig.useResponsesApi;

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
        fetch: secureLlmFetch("OpenAI LLM base URL"),
      },
      useResponsesApi: openAIConfig.useResponsesApi,
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
        fetch: secureLlmFetch("Azure OpenAI LLM base URL", [
          AZURE_OPENAI_API_KEY_HEADER,
        ]),
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
    const { credentials, clientOptions } = resolveBedrockAuth({
      secretKey: apiKey,
      allowDefaultCredentials: isSelfHosted || shouldUseLangfuseAPIKey,
    });

    chatModel = new ChatBedrockConverse({
      model: modelParams.model,
      region,
      credentials,
      clientOptions,
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

    // location flows into the Vertex host both SDKs build from it
    // (https://${location}-aiplatform.googleapis.com), so reject anything that
    // could reshape that host and exfiltrate the Google OAuth bearer token.
    if (location && !VERTEX_LOCATION_PATTERN.test(location)) {
      throw new Error(
        "Invalid Vertex AI location. Locations must be a single Vertex region identifier.",
      );
    }

    // Handle both explicit credentials and default provider chain (ADC)
    // Only allow default provider chain in self-hosted or internal AI features
    const shouldUseDefaultCredentials =
      apiKey === VERTEXAI_USE_DEFAULT_CREDENTIALS && !isLangfuseCloud;

    // When using ADC, authOptions must be undefined to use google-auth-library's default credential chain
    // This supports: GKE Workload Identity, Cloud Run service accounts, GCE metadata service, gcloud auth
    // Security: We intentionally ignore user-provided projectId when using ADC to prevent
    // privilege escalation attacks where users could access other GCP projects via the server's credentials
    const serviceAccountKey = shouldUseDefaultCredentials
      ? undefined
      : GCPServiceAccountKeySchema.parse(JSON.parse(apiKey));
    const authOptions: GoogleAuthOptions | undefined = serviceAccountKey
      ? {
          credentials: serviceAccountKey,
          projectId: serviceAccountKey.project_id,
        }
      : undefined; // Always use ADC auto-detection, never allow user-specified projectId

    // Requests time out after 60 seconds for both public and private endpoints by default
    // Reference: https://cloud.google.com/vertex-ai/docs/predictions/get-online-predictions#send-request
    if (isClaudeModel(modelParams.model)) {
      assertValidAnthropicVertexModelName(modelParams.model);
      const anthropicVertexGoogleAuth = new GoogleAuth({
        ...authOptions,
        scopes: authOptions?.scopes ?? VERTEX_AI_AUTH_SCOPES,
      });
      const anthropicVertexRegion = location ?? "global";

      // LangChain keeps Claude-on-Vertex on ChatAnthropic + AnthropicVertex
      // while @langchain/google is still focused on Gemini/Gemma.
      // https://github.com/langchain-ai/langchain-google/discussions/1422
      chatModel = new ChatAnthropic({
        model: modelParams.model,
        temperature: modelParams.temperature,
        maxTokens: modelParams.max_tokens,
        topP: modelParams.top_p,
        callbacks: finalCallbacks,
        maxRetries,
        invocationKwargs: (() => {
          const { model: _ignoredModelOverride, ...sanitized } =
            (getAnthropicInvocationKwargs(modelParams) ?? {}) as Record<
              string,
              unknown
            >;
          return sanitized;
        })(),
        clientOptions: {
          timeout: timeoutMs,
          defaultHeaders: extraHeaders,
          fetch: secureLlmFetch("Anthropic Vertex AI endpoint", [
            VERTEX_AI_AUTH_HEADER,
          ]),
        },
        createClient: (options) =>
          new AnthropicVertex({
            ...options,
            region: anthropicVertexRegion,
            projectId: serviceAccountKey?.project_id,
            // @anthropic-ai/vertex-sdk depends on its own google-auth-library
            // copy, so the structurally compatible GoogleAuth instance needs an
            // explicit cast across duplicate private class declarations.
            googleAuth: anthropicVertexGoogleAuth as unknown as NonNullable<
              AnthropicVertexClientOptions["googleAuth"]
            >,
            maxRetries: 0,
          }),
      });
      normalizeAnthropicSamplingParams(chatModel, modelParams);
    } else {
      const googleProviderOptions = googleProviderOptionsSchema.parse(
        modelParams.providerOptions,
      );

      chatModel = new ChatGoogle({
        model: modelParams.model,
        temperature: modelParams.temperature,
        maxOutputTokens: modelParams.max_tokens,
        topP: modelParams.top_p,
        callbacks: finalCallbacks,
        maxRetries,
        location,
        vertexai: true,
        apiClient: createSecureVertexAIApiClient({
          authOptions,
          dispatcher: proxyDispatcher,
        }),
        ...(modelParams.maxReasoningTokens !== undefined && {
          maxReasoningTokens: modelParams.maxReasoningTokens,
        }),
        ...((googleProviderOptions as any) ?? {}), // Typecast as thinkingLevel is intentionally looser typed
      });
    }
  } else if (modelParams.adapter === LLMAdapter.GoogleAIStudio) {
    const googleProviderOptions = googleProviderOptionsSchema.parse(
      modelParams.providerOptions,
    );

    chatModel = new ChatGoogle({
      model: modelParams.model,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
      apiKey,
      apiClient: createSecureGoogleAIStudioApiClient({
        apiKey,
        baseURL,
        dispatcher: proxyDispatcher,
      }),
      ...((googleProviderOptions as any) ?? {}), // Typecast as thinkingLevel is intentionally looser typed
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

  const runtimeTimeoutEnabled = RUNTIME_TIMEOUT_ADAPTERS.has(
    modelParams.adapter,
  );
  const runtimeTimeoutController = runtimeTimeoutEnabled
    ? new AbortController()
    : undefined;
  const runConfigWithTimeout = runtimeTimeoutController
    ? {
        ...runConfig,
        signal: runtimeTimeoutController.signal,
      }
    : runConfig;

  const supportsReasoning = adapterSupportsReasoning(modelParams.adapter);
  const shouldNormalizeModelContentBlocks =
    shouldNormalizeContentBlocks(modelParams);
  const shouldNormalizeStreamingContentBlocks =
    shouldNormalizeModelContentBlocks || usesOpenAIResponsesApi;

  try {
    // Important: await all generations in the try block as otherwise `processTracedEvents` will run too early in finally block
    if (params.structuredOutputSchema) {
      // Thinking-capable adapters may produce reasoning blocks that corrupt JSON schema
      // parsing. Force function calling so the parser reads from tool_calls instead.
      const structuredOutputSchema = params.structuredOutputSchema;
      const structuredOutputConfig = supportsReasoning
        ? { method: "functionCalling" as const }
        : undefined;
      const createStructuredOutputModel = () => {
        const isAnthropicChatModel =
          modelParams.adapter === LLMAdapter.Anthropic ||
          (modelParams.adapter === LLMAdapter.VertexAI &&
            isClaudeModel(modelParams.model));

        if (
          !isAnthropicChatModel ||
          !isAnthropicAlwaysAdaptiveThinkingModel(modelParams.model)
        ) {
          return (chatModel as ChatOpenAI).withStructuredOutput(
            structuredOutputSchema,
            structuredOutputConfig,
          );
        }

        const anthropicChatModel = chatModel as ChatAnthropic & {
          thinking: ChatAnthropicInput["thinking"];
        };
        const originalThinking = anthropicChatModel.thinking;

        try {
          // Keep LangChain's structured-output decision in sync with
          // Anthropic's Fable/Mythos semantics. In @langchain/anthropic 1.3.26,
          // ChatAnthropic defaults this internal field to { type: "disabled" }.
          // withStructuredOutput() reads that field before request serialization:
          // disabled thinking makes it force tool_choice, while adaptive
          // thinking avoids forced tool use. Fable/Mythos treat an omitted
          // thinking field as always-on adaptive thinking, and Anthropic rejects
          // adaptive thinking combined with forced tool use. Temporarily mirror
          // the adaptive state only while constructing the structured-output
          // runnable; the actual request still omits the thinking field via
          // anthropicInvocationKwargs above.
          anthropicChatModel.thinking = { type: "adaptive" };

          return anthropicChatModel.withStructuredOutput(
            structuredOutputSchema,
            structuredOutputConfig,
          );
        } finally {
          anthropicChatModel.thinking = originalThinking;
        }
      };
      const structuredOutputModel = createStructuredOutputModel();

      const structuredOutput = await executeWithRuntimeTimeout({
        enabled: runtimeTimeoutEnabled,
        timeoutMs,
        abortController: runtimeTimeoutController,
        operation: () =>
          structuredOutputModel.invoke(finalMessages, runConfigWithTimeout),
      });

      return structuredOutput;
    }

    if (tools && tools.length > 0) {
      const langchainTools = tools.map((tool) => ({
        type: "function",
        function: tool,
      }));

      const result = await executeWithRuntimeTimeout({
        enabled: runtimeTimeoutEnabled,
        timeoutMs,
        abortController: runtimeTimeoutController,
        operation: () =>
          chatModel
            .bindTools(langchainTools)
            .invoke(finalMessages, runConfigWithTimeout),
      });

      // Always normalize through `splitAIMessage` so we feed the schema the
      // standard `contentBlocks` shape regardless of provider, instead of the
      // raw, provider-specific message content.
      const { contentWithoutThinking, reasoning } = splitAIMessage(result);
      const parsed = ToolCallResponseSchema.safeParse({
        content: contentWithoutThinking,
        tool_calls: result.tool_calls,
      });
      if (!parsed.success) throw Error("Failed to parse LLM tool call result");

      return {
        ...parsed.data,
        ...(reasoning ? { reasoning } : {}),
      };
    }

    if (streaming)
      return await executeWithRuntimeTimeout({
        enabled: runtimeTimeoutEnabled,
        timeoutMs,
        abortController: runtimeTimeoutController,
        operation: () =>
          chatModel
            .pipe(
              createBytesOutputParser(shouldNormalizeStreamingContentBlocks),
            )
            .stream(finalMessages, runConfigWithTimeout),
      });

    // content with thinking blocks can't be handled by StringOutputParser
    // Invoke model directly and extract text + reasoning separately.
    if (shouldNormalizeModelContentBlocks) {
      const aiMessage = await executeWithRuntimeTimeout({
        enabled: runtimeTimeoutEnabled,
        timeoutMs,
        abortController: runtimeTimeoutController,
        operation: () => chatModel.invoke(finalMessages, runConfigWithTimeout),
      });
      const completion = extractCompletionWithReasoning(aiMessage);

      // Bedrock only returns reasoning blocks for selected models. Preserve the
      // historical plain-string shape when the response contains no reasoning.
      if (
        modelParams.adapter === LLMAdapter.Bedrock &&
        completion.reasoning == null
      ) {
        return completion.text;
      }

      return completion;
    }

    const completion = await executeWithRuntimeTimeout({
      enabled: runtimeTimeoutEnabled,
      timeoutMs,
      abortController: runtimeTimeoutController,
      operation: () =>
        chatModel
          .pipe(new StringOutputParser())
          .invoke(finalMessages, runConfigWithTimeout),
    });

    return completion;
  } catch (e) {
    const responseStatusCode = getErrorResponseStatusCode(e) ?? 500;
    const rawMessage = e instanceof Error ? e.message : String(e);
    // Anthropic/OpenAI/Azure SDKs wrap synchronous fetch errors as
    // `APIConnectionError { message: "Connection error.", cause: original }`,
    // hiding the actual secureLlmFetch validation reason. Walk the `.cause`
    // chain for both retryability classification and the user-visible message
    // so operators see "Blocked hostname detected" / "Redirect validation
    // failed ..." instead of the unhelpful wrapper text.
    const nonRetryableCauseMessage = findNonRetryableCauseMessage(e);
    const message =
      nonRetryableCauseMessage ?? extractCleanErrorMessage(rawMessage);

    const hasNonRetryablePattern = nonRetryableCauseMessage !== undefined;

    // Determine retryability:
    // - 429 (rate limit): retryable with custom delay
    // - 5xx (server errors): retryable with custom delay
    // - 4xx (client errors): not retryable
    // - Non-retryable patterns: not retryable
    let isRetryable = false;

    if (ContextOverflowError.isInstance(e)) {
      isRetryable = false;
    } else if (
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

function extractCompletionWithReasoning(
  message: AIMessage,
): CompletionWithReasoning {
  const { text, reasoning } = splitAIMessage(message);

  return {
    text,
    ...(reasoning ? { reasoning } : {}),
  };
}

function createBytesOutputParser(
  normalizeContentBlocks: boolean,
): BytesOutputParser {
  return normalizeContentBlocks
    ? new ContentBlockBytesOutputParser()
    : new BytesOutputParser();
}

class ContentBlockBytesOutputParser extends BytesOutputParser {
  // Override `_baseMessageToString` (not `_baseMessageContentToString`) so we
  // have the whole AIMessage(Chunk) and can read `contentBlocks`, which the
  // langchain provider translator normalizes into standard blocks. This strips
  // reasoning blocks and also avoids serializing OpenAI Responses API lifecycle
  // chunks such as empty `final_answer` phase markers.
  protected _baseMessageToString(message: BaseMessage): string {
    if (AIMessage.isInstance(message) || AIMessageChunk.isInstance(message)) {
      return splitAIMessage(message).text;
    }
    return typeof message.content === "string"
      ? message.content
      : super._baseMessageToString(message);
  }
}

// Reads the standard `contentBlocks` view of an AIMessage(Chunk) and splits it
// into displayable text, reasoning, and a content array stripped of reasoning
// and tool_call blocks (tool calls live on `message.tool_calls`).
function splitAIMessage(
  message: AIMessage | AIMessageChunk,
): SplitAIMessageContent {
  if (typeof message.content === "string") {
    return { text: message.content, contentWithoutThinking: message.content };
  }

  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  const contentWithoutThinking: Array<ContentBlock.Standard> = [];

  for (const block of message.contentBlocks) {
    if (block.type === "reasoning") {
      if (typeof block.reasoning === "string")
        reasoningParts.push(block.reasoning);
      continue;
    }
    if (block.type === "tool_call") {
      // Already represented in `message.tool_calls`; omit to avoid duplicates.
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    }
    contentWithoutThinking.push(block);
  }

  return {
    text: textParts.join(""),
    contentWithoutThinking,
    ...(reasoningParts.length > 0
      ? { reasoning: reasoningParts.join("") }
      : {}),
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

// Walks an error and its `.cause` chain (cycle-safe), yielding each link.
function* walkCauseChain(error: unknown): Generator<unknown> {
  const visited = new Set<unknown>();
  for (
    let current: unknown = error;
    current && !visited.has(current);
    current = (current as any).cause
  ) {
    visited.add(current);
    yield current;
  }
}

function findNonRetryableCauseMessage(error: unknown): string | undefined {
  for (const current of walkCauseChain(error)) {
    if (!(current instanceof Error)) continue;
    const message = extractCleanErrorMessage(current.message);
    if (NON_RETRYABLE_LLM_ERROR_PATTERNS.some((p) => message.includes(p))) {
      return message;
    }
  }
  return undefined;
}

function getErrorResponseStatusCode(error: unknown): number | undefined {
  for (const current of walkCauseChain(error)) {
    if (!current || typeof current !== "object") continue;
    const errorLike = current as any;
    const statusCode = [
      errorLike.response?.status,
      errorLike.status,
      errorLike.statusCode,
      // Bedrock errors have status code in $metadata.httpStatusCode.
      errorLike.$metadata?.httpStatusCode,
    ]
      .map(toHttpStatusCode)
      .find((code) => code !== undefined);
    if (statusCode !== undefined) return statusCode;
  }
  return undefined;
}

function toHttpStatusCode(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
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
