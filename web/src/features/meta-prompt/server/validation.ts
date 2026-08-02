import { z } from "zod/v4";
import {
  LLMAdapter,
  ChatMessageSchema,
  JSONObjectSchema,
} from "@langfuse/shared";

const ModelParamsSchema = z.object({
  provider: z.string(),
  adapter: z.enum(LLMAdapter),
  model: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  maxReasoningTokens: z.number().optional(),
  providerOptions: JSONObjectSchema.optional(),
});

export const MetaPromptCompletionBodySchema = z.object({
  projectId: z.string(),
  messages: z.array(ChatMessageSchema),
  modelParams: ModelParamsSchema,
  targetPlatform: z
    .enum(["openai", "claude", "gemini", "generic"])
    .default("generic"),
  streaming: z.boolean().optional().default(true),
});

export type ValidatedMetaPromptCompletionBody = z.infer<
  typeof MetaPromptCompletionBodySchema
>;
