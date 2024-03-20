import { StreamingTextResponse } from "ai";
import { BytesOutputParser } from "langchain/schema/output_parser";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ChatMessageRole,
  ModelProvider,
  anthropicModels,
  openAIModels,
} from "@/src/features/playground/types";
import { ChatAnthropic } from "@langchain/anthropic";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

const OpenAIModelSchema = z.enum([...openAIModels]);
const AnthropicModelSchema = z.enum([...anthropicModels]);

const OpenAIModelParamsSchema = z.object({
  provider: z.literal(ModelProvider.OpenAI),
  model: OpenAIModelSchema,
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
});

const AnthropicModelParamsSchema = z.object({
  provider: z.literal(ModelProvider.Anthropic),
  model: AnthropicModelSchema,
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
});

const ModelParamsSchema = z.union([
  OpenAIModelParamsSchema,
  AnthropicModelParamsSchema,
]);

const MessageSchema = z.object({
  role: z.nativeEnum(ChatMessageRole),
  content: z.string(),
  id: z.string().optional(),
});

const chatCompletionInput = z.object({
  messages: z.array(MessageSchema),
  modelParams: ModelParamsSchema,
});

export default async function chatCompletionHandler(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );
  }

  const body = (await req.json()) as unknown;

  let input: ReturnType<typeof chatCompletionInput.parse>;
  try {
    input = chatCompletionInput.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        message: "Invalid request body",
        error: err,
      },
      { status: 400 },
    );
  }

  const { messages, modelParams } = input;

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
      frequencyPenalty: modelParams.frequency_penalty,
      presencePenalty: modelParams.presence_penalty,
    });
  }

  const outputParser = new BytesOutputParser();
  const stream = await chatModel.pipe(outputParser).stream(finalMessages);

  return new StreamingTextResponse(stream);
}
