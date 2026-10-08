export const AGENT_NAME_METADATA_KEY = "langfuse_agent_name";
export const AGENT_ID_METADATA_KEY = "langfuse_agent_id";
export const AGENT_VERSION_METADATA_KEY = "langfuse_agent_version";
// events_core retains the first 200 Unicode characters of each metadata value.
export const MAX_AGENT_NAME_LENGTH = 200;

// PLACEHOLDER(skills): replace with skillsResourceLoaded / skillsAvailable once the skill columns land.
export const SKILL_TOOL_NAMES = [
  "skill",
  "skills",
  "skill_read",
  "skill_load",
  "load_skill",
  "read_skill",
  "load_skill_resource",
  "read_skill_resource",
  "get_skill_instructions",
  "run_skill_script",
] as const;
