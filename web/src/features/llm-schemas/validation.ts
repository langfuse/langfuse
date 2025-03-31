import { z } from "zod";
import { LLMJSONSchema } from "@langfuse/shared";

export const LLMSchemaInput = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9_-]+$/,
      "Name must contain only lowercase letters, numbers, hyphens and underscores",
    )
    .min(1, "Name is required"),
  description: z.string(),
  schema: LLMJSONSchema,
});

export const CreateLlmSchemaInput = LLMSchemaInput.extend({
  projectId: z.string(),
});

export const UpdateLlmSchemaInput = LLMSchemaInput.extend({
  id: z.string(),
  projectId: z.string(),
});

export const DeleteLlmSchemaInput = z.object({
  id: z.string(),
  projectId: z.string(),
});
