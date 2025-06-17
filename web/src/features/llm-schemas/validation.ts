import { z } from "zod/v4";
import { LLMJSONSchema } from "@langfuse/shared";

export const LLMSchemaNameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Name must contain only alphanumeric letters, hyphens and underscores",
  )
  .min(1, "Name is required");

export const LLMSchemaInput = z.object({
  name: LLMSchemaNameSchema,
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
