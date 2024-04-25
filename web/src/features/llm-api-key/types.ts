import { z } from "zod";
import { ModelProvider } from "@langfuse/shared";

export const ZodModelProvider = z.enum([
  ModelProvider.Anthropic,
  ModelProvider.OpenAI,
]);

export const CreateLlmApiKey = z.object({
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: z.literal(ModelProvider.OpenAI),
});
