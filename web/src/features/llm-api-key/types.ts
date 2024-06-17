import { z } from "zod";
import { LLMAdapter } from "@langfuse/shared";

export const CreateLlmApiKey = z.object({
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: z.string().min(3),
  adapter: z.nativeEnum(LLMAdapter),
  baseURL: z.string().url().optional(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string()).optional(),
});
