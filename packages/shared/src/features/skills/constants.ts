export const SKILL_LATEST_LABEL = "latest";
export const SKILL_PRODUCTION_LABEL = "production";
export const MAX_SKILL_FILES = 200;
export const MAX_SKILL_PATH_LENGTH = 512;
export const MAX_SKILL_BYTES = 1_000_000;

export const MAX_SKILL_CATALOG_JSON_BYTES = 64 * 1024;
export const MAX_SKILL_TOOL_ARGS_JSON_BYTES = 16 * 1024;
export const MAX_SKILL_ERROR_JSON_BYTES = 4 * 1024;

export const SKILL_RESOURCE_TOOL_NAMES = new Set([
  "skill",
  "Skill",
  "loadSkill",
  "skill_read",
  "readFile",
  "Read",
]);
