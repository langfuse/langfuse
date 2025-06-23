import { z } from "zod/v4";
import {
  LLMAdapter,
  BedrockConfigSchema,
  VertexAIConfigSchema,
} from "@langfuse/shared";

export const LlmApiKeySchema = z.object({
  projectId: z.string(),
  provider: z.string().min(1),
  adapter: z.enum(LLMAdapter),
  baseURL: z.string().url().optional(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: z.union([VertexAIConfigSchema, BedrockConfigSchema]).optional(),
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
