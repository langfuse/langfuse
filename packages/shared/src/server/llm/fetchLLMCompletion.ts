import type { ZodSchema } from "zod";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatBedrockConverse } from "@langchain/aws";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI } from "@langchain/openai";
import GCPServiceAccountKeySchema, {
  BedrockConfigSchema,
  BedrockCredentialSchema,
} from "../../interfaces/customLLMProviderConfigSchemas";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";
import {
  ChatMessage,
  ChatMessageRole,
  LLMAdapter,
  ModelParams,
  TraceParams,
} from "./types";
import { CallbackHandler } from "langfuse-langchain";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";

type ProcessTracedEvents = () => Promise<void>;

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  structuredOutputSchema?: ZodSchema;
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
};

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: true;
  },
): Promise<{
  completion: IterableReadableStream<Uint8Array>;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
  },
): Promise<{ completion: string; processTracedEvents: ProcessTracedEvents }>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  },
): Promise<{
  completion: unknown;
  processTracedEvents: ProcessTracedEvents;
}>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams,
): Promise<{
  completion: string | IterableReadableStream<Uint8Array> | unknown;
  processTracedEvents: ProcessTracedEvents;
}> {
  // the apiKey must never be printed to the console
  const {
    messages,
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
      tags: traceParams.tags,
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
        );
      } catch (e) {
        logger.error("Failed to process traced events", { error: e });
      }
    };
  }

  finalCallbacks = finalCallbacks.length > 0 ? finalCallbacks : undefined;

  let finalMessages: BaseMessage[];
  // VertexAI requires at least 1 user message
  if (modelParams.adapter === LLMAdapter.VertexAI && messages.length === 1) {
    finalMessages = [new HumanMessage(messages[0].content)];
  } else {
    finalMessages = messages.map((message) => {
      if (message.role === ChatMessageRole.User)
        return new HumanMessage(message.content);
      if (
        message.role === ChatMessageRole.System ||
        message.role === ChatMessageRole.Developer
      )
        return new SystemMessage(message.content);

      return new AIMessage(message.content);
    });
  }

  finalMessages = finalMessages.filter((m) => m.content.length > 0);

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
    chatModel = new ChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIBasePath: baseURL,
      azureOpenAIApiDeploymentName: modelParams.model,
      azureOpenAIApiVersion: "2024-02-01",
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

    // Requests time out after 60 seconds for both public and private endpoints by default
    // Reference: https://cloud.google.com/vertex-ai/docs/predictions/get-online-predictions#send-request
    chatModel = new ChatVertexAI({
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxOutputTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks: finalCallbacks,
      maxRetries,
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
    throw new Error("This model provider is not supported.");
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
    return { completion: null, processTracedEvents };
  }
}
