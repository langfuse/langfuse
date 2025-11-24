import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";
import {
  PROMPT_NAME_PIPE_RESTRICTION_REGEX,
  PROMPT_NAME_PIPE_RESTRICTION_ERROR,
  RESERVED_PROMPT_NAME_NEW,
} from "./constants";

/**
 * Prompt name validation schema for API, tRPC and client
 */
export const PromptNameSchema = withFolderPathValidation(
  StringNoHTMLNonEmpty.regex(
    PROMPT_NAME_PIPE_RESTRICTION_REGEX,
    // Note: pipe character is used for prompt composition
    PROMPT_NAME_PIPE_RESTRICTION_ERROR,
  ),
  // Note: we use "new" as a special name for the new prompt form
).refine(
  (name) => name !== RESERVED_PROMPT_NAME_NEW,
  `Prompt name cannot be '${RESERVED_PROMPT_NAME_NEW}'`,
);
