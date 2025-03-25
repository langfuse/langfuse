import { z } from "zod";
import {
  LLMAdapter,
  LLMJSONSchema,
  LLMToolSchema,
  ChatMessageSchema,
} from "@langfuse/shared";

const ModelParamsSchema = z.object({
  provider: z.string(),
  adapter: z.nativeEnum(LLMAdapter),
  model: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
});

export const ChatCompletionBodySchema = z.object({
  projectId: z.string(),
  messages: z.array(ChatMessageSchema),
  modelParams: ModelParamsSchema,
  tools: z.array(LLMToolSchema).optional(),
  structuredOutputSchema: LLMJSONSchema.optional(),
});

export const validateChatCompletionBody = (input: unknown) => {
  return ChatCompletionBodySchema.parse(input);
};

export type ValidatedChatCompletionBody = z.infer<
  typeof ChatCompletionBodySchema
>;
