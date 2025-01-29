import { z } from "zod";
import { LLMAdapter, BedrockConfigSchema } from "@langfuse/shared";

export const CreateLlmApiKey = z.object({
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: z.string().min(1),
  adapter: z.nativeEnum(LLMAdapter),
  baseURL: z.string().url().optional(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: BedrockConfigSchema.optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});
