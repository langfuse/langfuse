import { z } from "zod";
import { LLMJSONSchema, LLMToolNameSchema } from "@langfuse/shared";

export { LLMToolNameSchema } from "@langfuse/shared";

export const LLMToolInput = z.object({
  name: LLMToolNameSchema,
  description: z.string(),
  parameters: LLMJSONSchema,
});

export const CreateLlmToolInput = LLMToolInput.extend({
  projectId: z.string(),
});

export const UpdateLlmToolInput = LLMToolInput.extend({
  id: z.string(),
  projectId: z.string(),
});

export const DeleteLlmToolInput = z.object({
  id: z.string(),
  projectId: z.string(),
});
