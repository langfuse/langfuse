import { z } from "zod";
import {
  ChatMessageRole,
  ModelProvider,
  anthropicModels,
  openAIModels,
} from "@langfuse/shared";

const OpenAIModelSchema = z.enum([...openAIModels]);
const AnthropicModelSchema = z.enum([...anthropicModels]);
const OpenAIModelParamsSchema = z.object({
  provider: z.literal(ModelProvider.OpenAI),
  model: OpenAIModelSchema,
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
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
export const ChatCompletionBodySchema = z.object({
  messages: z.array(MessageSchema),
  modelParams: ModelParamsSchema,
});

export const validateChatCompletionBody = (input: unknown) => {
  return ChatCompletionBodySchema.parse(input);
};

export type ValidatedChatCompletionBody = z.infer<
  typeof ChatCompletionBodySchema
>;
