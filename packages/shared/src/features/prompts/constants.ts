export const PRODUCTION_LABEL = "production";
export const LATEST_PROMPT_LABEL = "latest";
export const COMMIT_MESSAGE_MAX_LENGTH = 500;

// Prompt name validation
export const PROMPT_NAME_MAX_LENGTH = 255;
export const RESERVED_PROMPT_NAME_NEW = "new";
export const PROMPT_NAME_PIPE_RESTRICTION_REGEX = /^[^|]*$/;
export const PROMPT_NAME_PIPE_RESTRICTION_ERROR =
  "Prompt name cannot contain '|' character";

// Prompt label validation
export const PROMPT_LABEL_MAX_LENGTH = 36;
export const PROMPT_LABEL_REGEX = /^[a-z0-9_\-.]+$/;
export const PROMPT_LABEL_REGEX_ERROR =
  "Label must be lowercase alphanumeric with optional underscores, hyphens, or periods";
