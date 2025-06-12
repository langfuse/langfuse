import { z } from "zod";
import { LLMAdapter, BedrockConfigSchema } from "@langfuse/shared";

export const LlmApiKeySchema = z.object({
  projectId: z.string(),
  provider: z.string().min(1),
  adapter: z.nativeEnum(LLMAdapter),
  baseURL: z.string().url().optional(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: BedrockConfigSchema.optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

export const CreateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z.string().min(1),
});

export const UpdateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 1,
      "Secret key must be at least 1 character long",
    ),
  id: z.string(),
});
