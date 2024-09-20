import { type ZodSchema } from "zod";

import { ChatAnthropic } from "@langchain/anthropic";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI } from "@langchain/openai";

import { ChatMessage, ChatMessageRole, ModelParams, LLMAdapter } from "./types";

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  structuredOutputSchema?: ZodSchema;
  callbacks?: BaseCallbackHandler[];
  baseURL?: string;
  apiKey?: string;
  maxRetries?: number;
};

type FetchLLMCompletionParams = LLMCompletionParams & {
  streaming: boolean;
};

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: true;
  }
): Promise<IterableReadableStream<Uint8Array>>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
  }
): Promise<string>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    structuredOutputSchema: ZodSchema;
  }
): Promise<unknown>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams
): Promise<string | IterableReadableStream<Uint8Array> | unknown> {
  // the apiKey must never be printed to the console
  const {
    messages,
    modelParams,
    streaming,
    callbacks,
    apiKey,
    baseURL,
    maxRetries,
  } = params;

  const finalMessages = messages.map((message) => {
    if (message.role === ChatMessageRole.User)
      return new HumanMessage(message.content);
    if (message.role === ChatMessageRole.System)
      return new SystemMessage(message.content);

    return new AIMessage(message.content);
  });

  let chatModel: ChatOpenAI | ChatAnthropic;
  if (modelParams.adapter === LLMAdapter.Anthropic) {
    chatModel = new ChatAnthropic({
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks,
      clientOptions: { maxRetries },
    });
  } else if (modelParams.adapter === LLMAdapter.OpenAI) {
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks,
      maxRetries,
      configuration: {
        baseURL,
      },
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
      callbacks,
      maxRetries,
    });
  } else {
    // eslint-disable-next-line no-unused-vars
    const _exhaustiveCheck: never = modelParams.adapter;
    throw new Error("This model provider is not supported.");
  }

  if (params.structuredOutputSchema) {
    return await (chatModel as ChatOpenAI) // Typecast necessary due to https://github.com/langchain-ai/langchainjs/issues/6795
      .withStructuredOutput(params.structuredOutputSchema)
      .invoke(finalMessages);
  }

  /*
  Workaround OpenAI o1 while in beta:
  
  This is a temporary workaround to avoid sending system messages to OpenAI's O1 models.
  O1 models do not support in beta:
  - system messages
  - top_p
  - max_tokens at all, one has to use max_completion_tokens instead
  - temperature different than 1

  Reference: https://platform.openai.com/docs/guides/reasoning/beta-limitations
  */
  if (modelParams.model.startsWith("o1-")) {
    return await new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: 1,
      maxTokens: undefined,
      topP: undefined,
      callbacks,
      maxRetries,
      configuration: {
        baseURL,
      },
    })
      .pipe(new StringOutputParser())
      .invoke(
        finalMessages.filter((message) => message._getType() !== "system")
      );
  }

  if (streaming) {
    return chatModel.pipe(new BytesOutputParser()).stream(finalMessages);
  }

  return await chatModel.pipe(new StringOutputParser()).invoke(finalMessages);
}
