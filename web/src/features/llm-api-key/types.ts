import { z } from "zod";
import { ModelProvider } from "@langfuse/shared";

export const CreateLlmApiKey = z.object({
  projectId: z.string(),
  secretKey: z.string().min(1),
  provider: z.nativeEnum(ModelProvider),
});
