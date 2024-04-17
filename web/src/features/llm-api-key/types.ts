import { z } from "zod";
import { ModelProvider } from "@langfuse/shared";

export const ZodModelProvider = z.enum([
  ModelProvider.Anthropic,
  ModelProvider.OpenAI,
]);

export const CreateLlmApiKey = z.object({
  name: z.string().min(1),
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: ZodModelProvider,
});
