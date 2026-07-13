import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";
import {
  SKILL_NAME_PIPE_RESTRICTION_REGEX,
  SKILL_NAME_PIPE_RESTRICTION_ERROR,
  RESERVED_SKILL_NAME_NEW,
} from "./constants";

/**
 * Skill name validation schema for API, tRPC and client
 */
export const SkillNameSchema = withFolderPathValidation(
  StringNoHTMLNonEmpty.regex(
    SKILL_NAME_PIPE_RESTRICTION_REGEX,
    SKILL_NAME_PIPE_RESTRICTION_ERROR,
  ),
  // Note: we use "new" as a special name for the new skill form
).refine(
  (name) => name !== RESERVED_SKILL_NAME_NEW,
  `Skill name cannot be '${RESERVED_SKILL_NAME_NEW}'`,
);
