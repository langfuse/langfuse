export const AGENT_NAME_METADATA_KEY = "langfuse_agent_name";
export const AGENT_ID_METADATA_KEY = "langfuse_agent_id";
export const AGENT_VERSION_METADATA_KEY = "langfuse_agent_version";
// events_core retains the first 200 Unicode characters of each metadata value.
export const MAX_AGENT_NAME_LENGTH = 200;

export const AGENT_PROJECTION_LIMITS = {
  agents: 25,
  sessions: 500,
  observations: 20_000,
  groups: 50,
  activityBuckets: 336,
  discoveryDays: 30,
  maxWindowDays: 30,
  settledMinutes: 5,
  baselineSessions: 20,
  recentSessions: 5,
} as const;

// Optional prototype annotations. These are declarations, not inferred task or causal evidence.
export const AGENT_PROJECTION_METADATA_KEYS = {
  task: "agent_view_task",
  area: "agent_view_area",
  topic: "agent_view_topic",
  availableSkills: "agent_view_available_skills",
  availableTools: "agent_view_available_tools",
  parentSessionId: "agent_view_parent_session_id",
  parentAgentName: "agent_view_parent_agent_name",
} as const;

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
