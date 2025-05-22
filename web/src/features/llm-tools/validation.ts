import { z } from "zod/v4";
import { LLMJSONSchema } from "@langfuse/shared";

export const LLMToolNameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Name must contain only alphanumeric letters, hyphens and underscores",
  )
  .min(1, "Name is required");

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
