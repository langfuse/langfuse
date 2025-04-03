import { z } from "zod";
import { LLMJSONSchema } from "@langfuse/shared";

export const LLMToolInput = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Name must contain only alphanumeric letters, hyphens and underscores",
    )
    .min(1, "Name is required"),
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
