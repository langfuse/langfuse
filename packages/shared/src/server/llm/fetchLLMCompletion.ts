import { ChatAnthropic } from "@langchain/anthropic";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  BytesOutputParser,
  StringOutputParser,
} from "@langchain/core/output_parsers";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { ChatOpenAI } from "@langchain/openai";

import {
  ChatMessage,
  ChatMessageRole,
  ModelParams,
  ModelProvider,
} from "./types";

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
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
  params: FetchLLMCompletionParams
): Promise<string | IterableReadableStream<Uint8Array>> {
  const { messages, modelParams, streaming } = params;
  const finalMessages = messages.map((message) => {
    if (message.role === ChatMessageRole.User)
      return new HumanMessage(message.content);
    if (message.role === ChatMessageRole.System)
      return new SystemMessage(message.content);

    return new AIMessage(message.content);
  });

  let chatModel: ChatOpenAI | ChatAnthropic;
  if (modelParams.provider === ModelProvider.Anthropic) {
    chatModel = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
    });
  } else {
    chatModel = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
    });
  }

  if (streaming) {
    return chatModel.pipe(new BytesOutputParser()).stream(finalMessages);
  }

  return await chatModel.pipe(new StringOutputParser()).invoke(finalMessages);
}
