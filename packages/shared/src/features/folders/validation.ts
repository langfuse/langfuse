import { type ZodString } from "zod/v4";

/**
 * Helper function to add path validation to a string schema
 * Validates slash usage and trimming for hierarchical names (e.g., folders, prompts)
 */
export const withFolderPathValidation = (schema: ZodString) =>
  schema
    .regex(/^[^/]/, "Name cannot start with a slash")
    .regex(/^(?!.*\/\/)/, "Name cannot contain consecutive slashes")
    .regex(/^.*[^/]$/, "Name cannot end with a slash")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "Name cannot be empty");
