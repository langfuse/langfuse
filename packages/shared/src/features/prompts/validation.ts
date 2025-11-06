import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";

/**
 * Prompt name validation schema for API, tRPC and client
 */
export const PromptNameSchema = withFolderPathValidation(
  StringNoHTMLNonEmpty.regex(
    /^[^|]*$/,
    // Note: pipe character is used for prompt composition
    "Prompt name cannot contain '|' character",
  ),
  // Note: we use "new" as a special name for the new prompt form
).refine((name) => name !== "new", "Prompt name cannot be 'new'");
