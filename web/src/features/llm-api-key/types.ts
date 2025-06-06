import { z } from "zod";
import { LLMAdapter, BedrockConfigSchema } from "@langfuse/shared";

export const CreateLlmApiKey = z.object({
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: z.string().min(1),
  adapter: z.nativeEnum(LLMAdapter),
  baseURL: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === "" || z.string().url().safeParse(val).success,
      {
        message: "Base URL must be a valid URL or empty",
      },
    ),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: BedrockConfigSchema.optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

export const UpdateLlmApiKey = z
  .object({
    id: z.string(),
    projectId: z.string(),
    lastKnownUpdate: z.date(),
  })
  .merge(CreateLlmApiKey.omit({ projectId: true }).partial());
