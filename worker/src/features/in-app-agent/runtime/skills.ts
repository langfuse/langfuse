import { createSkill } from "@mastra/core/skills";

import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";

export const LANGFUSE_IN_APP_AGENT_SKILLS = LANGFUSE_SKILLS.map((skill) =>
  createSkill(skill),
);
