import { z } from "zod/v4";
import {
  LLMAdapter,
  LLMJSONSchema,
  LLMToolDefinitionSchema,
  ChatMessageSchema,
} from "@langfuse/shared";

const ModelParamsSchema = z.object({
  provider: z.string(),
  adapter: z.enum(LLMAdapter),
  model: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
});

export const ChatCompletionBodySchema = z.object({
  projectId: z.string(),
  messages: z.array(ChatMessageSchema),
  modelParams: ModelParamsSchema,
  tools: z.array(LLMToolDefinitionSchema).optional(),
  structuredOutputSchema: LLMJSONSchema.optional(),
  streaming: z.boolean().optional().default(true),
});

export const validateChatCompletionBody = (input: unknown) => {
  return ChatCompletionBodySchema.parse(input);
};

export type ValidatedChatCompletionBody = z.infer<
  typeof ChatCompletionBodySchema
>;
