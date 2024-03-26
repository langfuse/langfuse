import {
  type ChatMessage,
  ChatMessageRole,
  type ModelParams,
  ModelProvider,
  LLMFunctionCall,
} from "./types";
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
import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { zodToJsonSchema } from "zod-to-json-schema";

type LLMCompletionParams = {
  messages: ChatMessage[];
  modelParams: ModelParams;
  functionCall?: LLMFunctionCall;
};

type FetchLLMCompletionParams = LLMCompletionParams & {
  streaming: boolean;
};

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: true;
    functionCall: undefined;
  }
): Promise<ReadableStream<Uint8Array>>;

export async function fetchLLMCompletion(
  params: LLMCompletionParams & {
    streaming: false;
    functionCall: undefined;
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
): Promise<string | ReadableStream<Uint8Array> | unknown> {
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

  if (params.functionCall) {
    const functionCallingModel = chatModel.bind({
      functions: [
        {
          ...params.functionCall,
          parameters: zodToJsonSchema(params.functionCall.parameters),
        },
      ],
      function_call: { name: "evalutate" },
    });
    const outputParser = new JsonOutputFunctionsParser();
    return await functionCallingModel.pipe(outputParser).invoke(finalMessages);
  }

  if (streaming) {
    return chatModel.pipe(new BytesOutputParser()).stream(finalMessages);
  }

  return await chatModel.pipe(new StringOutputParser()).invoke(finalMessages);
}
