import { StringNoHTMLNonEmpty } from "../../utils/zod";

/**
 * Prompt name validation schema for API, tRPC and client
 */
export const PromptNameSchema = StringNoHTMLNonEmpty.regex(
  /^[^|]*$/,
  "Prompt name cannot contain '|' character",
)
  .regex(/^[^/]/, "Name cannot start with a slash")
  .regex(/^(?!.*\/\/)/, "Name cannot contain consecutive slashes")
  .regex(/^.*[^/]$/, "Name cannot end with a slash")
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Name cannot be empty")
  .refine((name) => name !== "new", "Prompt name cannot be 'new'");
