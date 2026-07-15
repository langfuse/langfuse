import { z } from "zod";
import {
  LLMAdapter,
  LLMJSONSchema,
  LLMToolDefinitionSchema,
  ChatMessageSchema,
  ZodModelConfig,
  ZodModelConfigInput,
} from "@langfuse/shared";

const ModelParamsSchema = ZodModelConfigInput.extend({
  provider: z.string(),
  adapter: z.enum(LLMAdapter),
  model: z.string(),
}).transform(({ provider, adapter, model, ...config }) => ({
  provider,
  adapter,
  model,
  ...ZodModelConfig.parse(config),
}));

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
