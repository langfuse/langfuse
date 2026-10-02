import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";
import {
  PROMPT_NAME_PIPE_RESTRICTION_REGEX,
  PROMPT_NAME_PIPE_RESTRICTION_ERROR,
  RESERVED_PROMPT_NAMES,
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
).refine(
  // Reserved: names of the static /prompts/* pages (see RESERVED_PROMPT_NAMES).
  // Only the exact name collides — "metrics/foo" or "foo/metrics" route
  // through the [[...folder]] catch-all.
  (name) => !(RESERVED_PROMPT_NAMES as readonly string[]).includes(name),
  { error: (issue) => `Prompt name cannot be '${issue.input}'` },
);
