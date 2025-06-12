import { z } from "zod";

/**
 * Prompt name validation schema for API, tRPC and client
 */
export const PromptNameSchema = z
  .string()
  .min(1, "Enter a name")
  .regex(/^[^|]*$/, "Prompt name cannot contain '|' character")
  .regex(/^[a-zA-Z0-9_\-/.]+$/, "Name must be alphanumeric with optional underscores, hyphens, periods or slashes")
  .regex(/^[^/]/, "Name cannot start with a slash")
  .regex(/^(?!.*\/\/)/, "Name cannot contain consecutive slashes")
  .regex(/^.*[^/]$/, "Name cannot end with a slash")
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Name cannot be empty")
  .refine((name) => name !== "new", "Prompt name cannot be 'new'");
