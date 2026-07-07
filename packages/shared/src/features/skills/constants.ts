// Note: PRODUCTION_LABEL and COMMIT_MESSAGE_MAX_LENGTH are shared with prompts
// and re-exported from "../prompts/constants" via the package barrel; skills
// import them from there to avoid duplicate exports.
export const LATEST_SKILL_LABEL = "latest";

// Skill name validation
export const SKILL_NAME_MAX_LENGTH = 255;
export const RESERVED_SKILL_NAME_NEW = "new";
export const SKILL_NAME_PIPE_RESTRICTION_REGEX = /^[^|]*$/;
export const SKILL_NAME_PIPE_RESTRICTION_ERROR =
  "Skill name cannot contain '|' character";

// Skill label validation
export const SKILL_LABEL_MAX_LENGTH = 36;
export const SKILL_LABEL_REGEX = /^[a-z0-9_\-.]+$/;
export const SKILL_LABEL_REGEX_ERROR =
  "Label must be lowercase alphanumeric with optional underscores, hyphens, or periods";

// Skill description validation (SKILL.md frontmatter)
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
