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

import {
  ChatMessage,
  ChatMessageRole,
  LLMFunctionCall,
  ModelParams,
  ModelProvider,
} from "./types";
import zodToJsonSchema from "zod-to-json-schema";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  functionCall?: LLMFunctionCall;
  callbacks?: BaseCallbackHandler[];
  apiKey?: string;
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
    functionCall: LLMFunctionCall;
  }
): Promise<unknown>;

export async function fetchLLMCompletion(
  params: FetchLLMCompletionParams
): Promise<string | IterableReadableStream<Uint8Array> | unknown> {
  // the apiKey must never be printed to the console
  const { messages, modelParams, streaming, callbacks, apiKey } = params;
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
      anthropicApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks,
    });
  } else if (modelParams.provider === ModelProvider.OpenAI) {
    chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelParams.model,
      temperature: modelParams.temperature,
      maxTokens: modelParams.max_tokens,
      topP: modelParams.top_p,
      callbacks,
    });
  } else {
    // eslint-disable-next-line no-unused-vars
    const _exhaustiveCheck: never = modelParams;
    throw new Error("This model provider is not supported.");
  }

  console.log("Making LLM call with params: ", modelParams);

  if (params.functionCall) {
    const functionCallingModel = chatModel.bind({
      functions: [
        {
          ...params.functionCall,
          parameters: zodToJsonSchema(params.functionCall.parameters),
        },
      ],
      function_call: { name: params.functionCall.name },
    });
    const outputParser = new JsonOutputFunctionsParser();
    return await functionCallingModel.pipe(outputParser).invoke(finalMessages);
  }

  if (streaming) {
    return chatModel.pipe(new BytesOutputParser()).stream(finalMessages);
  }

  return await chatModel.pipe(new StringOutputParser()).invoke(finalMessages);
}
